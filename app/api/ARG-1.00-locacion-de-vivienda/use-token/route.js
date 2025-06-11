// app/api/ARG-1.00-locacion-de-vivienda/use-token/route.js
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import memberstackAdmin from "@memberstack/admin";
import {
  interactWithWebflow,
  sendEmailNotification,
} from "../../../utils/apiUtils";
import { getColumnLetter } from "../../../utils/helpers";
import {
  createErrorResponse,
  createSuccessResponse,
} from "../../../utils/responseUtils";
import { logger } from '../../../utils/logger';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

// Función helper para crear respuestas consistentes
function createResponse(data, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    "Access-Control-Allow-Origin": allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return new NextResponse(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
}

export async function OPTIONS(req) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(req) {
  const origin = req.headers.get("origin");
  const responseHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  let contractID;
  try {
    const { contractID: id, memberstackID } = await req.json();
    contractID = id;
    logger.info('Inicio del proceso', contractID);

    if (!contractID || !memberstackID) {
      logger.error('contractID o memberstackID faltantes', contractID);
      return createResponse(
        { error: "contractID and memberstackID are required." },
        400
      );
    }

    // Verificar tokens en Memberstack
    const { data: member } = await memberstack.members.retrieve({
      id: memberstackID,
    });

    if (!member || parseInt(member.metaData?.tokens || 0, 10) <= 0) {
      logger.error('Usuario sin tokens disponibles', contractID);
      return createResponse(
        { error: "No tokens available." },
        403
      );
    }

    // Obtener contrato de Supabase
    const { data: contract, error } = await supabase
      .from('1.00 - Contrato de Locación de Vivienda - Database')
      .select('*')
      .eq('contractID', contractID)
      .eq('MemberstackID', memberstackID)
      .single();

    if (error || !contract) {
      logger.error('Contrato no encontrado en Supabase', contractID);
      return createResponse(
        { error: "Contract not found." },
        404
      );
    }

    const paymentId = uuidv4();
    const nowArgentina = new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    });

    // Actualizar contrato en Supabase
    const { error: updateError } = await supabase
      .from('1.00 - Contrato de Locación de Vivienda - Database')
      .update({
        tipoDePago: 'Token',
        estadoDePago: 'Pagado',
        payment_id: paymentId,
        fechaDePago: nowArgentina,
        status: 'Contrato'
      })
      .eq('contractID', contractID)
      .eq('MemberstackID', memberstackID);

    if (updateError) {
      logger.error('Error al actualizar contrato en Supabase', contractID);
      throw updateError;
    }

    // Generar documentos si es necesario
    if (!contract.payment_id && process.env.APPS_SCRIPT_GENERATE_DOC_URL && contract.status === 'Contrato') {
      logger.info('Solicitando generación de documentos', contractID);
      const dataToSendToAppsScript = {
        secret: process.env.VERCEL_API_SECRET,
        contractData: contract,
        headers: Object.keys(contract),
        values: Object.values(contract)
      };

      try {
        const appsScriptResponse = await fetch(
          process.env.APPS_SCRIPT_GENERATE_DOC_URL,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dataToSendToAppsScript),
          }
        );

        if (appsScriptResponse.ok) {
          const appsScriptResponseData = await appsScriptResponse.json();
          logger.info('Documentos generados', contractID);
          const pdfUrl = appsScriptResponseData?.pdfUrl;
          const docUrl = appsScriptResponseData?.docUrl;

          if (pdfUrl && docUrl) {
            // Actualizar URLs de documentos en Supabase
            await supabase
              .from('1.00 - Contrato de Locación de Vivienda - Database')
              .update({
                PDFFile: pdfUrl,
                DOCFile: docUrl
              })
              .eq('contractID', contractID)
              .eq('MemberstackID', memberstackID);

            // Actualizar Webflow
            if (process.env.WEBFLOW_API_TOKEN && process.env.WEBFLOW_CONTRACT_COLLECTION_ID) {
              const webflowUpdateResult = await interactWithWebflow(
                contractID,
                process.env.WEBFLOW_API_TOKEN,
                process.env.WEBFLOW_CONTRACT_COLLECTION_ID,
                Object.keys(contract),
                Object.values(contract),
                pdfUrl,
                docUrl,
                Object.values(contract),
                null,
                null,
                null,
                null,
                Object.keys(contract).indexOf("Editlink")
              );
              
              if (webflowUpdateResult.success) {
                logger.info('Webflow actualizado exitosamente', contractID);
              } else {
                logger.error('Error actualizando Webflow', contractID);
              }
            }

            // Enviar notificación por correo si hay emails
            let emailMember = contract.emailMember;
            let emailGuest = contract.emailGuest;

            if (emailMember || emailGuest) {
              const emailSent = await sendEmailNotification(
                emailMember,
                emailGuest,
                pdfUrl,
                docUrl,
                Object.values(contract),
                Object.keys(contract)
              );
              logger.info('Notificación de correo electrónico enviada', contractID);
            } else {
              logger.warn('No se enviará notificación por correo electrónico', contractID);
            }
          } else {
            logger.error('No se recibieron URLs de documentos de AppScript', contractID);
            return createResponse(
              { 
                error: "Error al generar documentos: No se recibieron URLs válidas",
                logs: appsScriptResponseData?.logs || []
              },
              500
            );
          }
        } else {
          logger.error('Error al generar documentos', contractID);
          const errorData = await appsScriptResponse.json();
          return createResponse(
            { 
              error: `Error al generar documentos: ${errorData?.error || 'Error desconocido'}`,
              logs: errorData?.logs || []
            },
            500
          );
        }
      } catch (error) {
        logger.error('Error al interactuar con Apps Script', contractID);
        return createResponse(
          { 
            error: `Error al interactuar con Apps Script: ${error.message}`,
            logs: []
          },
          500
        );
      }
    } else if (contract.payment_id) {
      logger.info('Pago existente encontrado, omitiendo generación y notificaciones', contractID);
    } else {
      logger.warn('No se generarán documentos, configuración faltante', contractID);
    }

    // Actualizar tokens en Memberstack
    const updatedTokens = parseInt(member.metaData?.tokens || 0, 10) - 1;
    await memberstack.members.update({
      id: memberstackID,
      data: {
        metaData: {
          ...member.metaData,
          tokens: updatedTokens,
        },
      },
    });

    // If user has no tokens left, remove from Has Credits plan
    if (updatedTokens === 0 && process.env.HAS_CREDITS_PLAN_ID) {
      await memberstack.members.removeFreePlan({
        id: memberstackID,
        data: {
          planId: process.env.HAS_CREDITS_PLAN_ID,
        },
      });
      logger.info('Usuario removido del plan Has Credits', contractID);
    }

    logger.info('Proceso completado exitosamente', contractID);
    return createResponse(
      {
        message: "Token used successfully",
        paymentId: paymentId,
        fechaDePago: nowArgentina,
      },
      200
    );
  } catch (error) {
    logger.error('Error en el procesamiento', contractID);
    return createResponse(
      { error: error.message },
      500
    );
  }
}