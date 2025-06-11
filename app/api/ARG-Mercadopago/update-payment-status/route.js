import { NextResponse } from "next/server";
import {
  interactWithWebflow,
  sendEmailNotification,
} from "../../../utils/apiUtils";
import { createClient } from '@supabase/supabase-js';
import { logger } from '../../../utils/logger';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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
    logger.info('Iniciando procesamiento de pago');
    const paymentData = await req.json();
    contractID = paymentData.contractID;

    if (!contractID) {
      logger.error('contractID faltante');
      return createResponse(
        { error: "contractID es requerido en el cuerpo de la solicitud." },
        400
      );
    }

    // Obtener contrato de Supabase
    const { data: contract, error: fetchError } = await supabase
      .from('1.00 - Contrato de Locación de Vivienda - Database')
      .select('*')
      .eq('contractID', contractID)
      .single();

    if (fetchError || !contract) {
      logger.error('Contrato no encontrado en Supabase', contractID);
      return createResponse(
        { error: "No se encontró entrada coincidente en la base de datos." },
        404
      );
    }

    // Verificar si es un pago nuevo y está aprobado
    const existingPaymentId = contract.payment_id;
    if (paymentData.estadoDePago === "Pagado" && !existingPaymentId) {
      logger.info('Solicitando generación de documentos', contractID);
      
      // Actualizar información de pago en Supabase
      const { error: updateError } = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .update({
          tipoDePago: paymentData.tipoDePago || 'Mercado Pago',
          estadoDePago: paymentData.estadoDePago,
          payment_id: paymentData.payment_id,
          fechaDePago: paymentData.fechaDePago,
          status: 'Contrato'
        })
        .eq('contractID', contractID);

      if (updateError) {
        logger.error(`Error al actualizar estado del pago en Supabase: ${updateError.message}`, contractID);
        return createResponse(
          { error: "Error al actualizar estado del pago" },
          500
        );
      }

      logger.info('Estado del pago actualizado exitosamente en Supabase', contractID);
      
        // Preparar datos para Apps Script
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
          logger.info(`Documentos generados para contractID: ${contractID}. PDF: ${!!pdfUrl}, DOC: ${!!docUrl}`);

          if (pdfUrl && docUrl) {
            // Actualizar URLs de documentos en Supabase
            const { error: updateError } = await supabase
              .from('1.00 - Contrato de Locación de Vivienda - Database')
              .update({
                PDFFile: pdfUrl,
                DOCFile: docUrl
              })
              .eq('contractID', contractID);

            if (updateError) {
              logger.error(`Error al actualizar URLs de documentos: ${updateError.message}`, contractID);
              return createResponse(
                { error: "Error al actualizar URLs de documentos" },
                500
              );
            }

            // Actualizar Webflow - Updated environment variable name
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
                logger.error(`Error actualizando Webflow: ${webflowUpdateResult.error}`, contractID);
                if (webflowUpdateResult.details) {
                  logger.error(`Detalles del error: ${JSON.stringify(webflowUpdateResult.details)}`, contractID);
                }
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
            if (appsScriptResponseData?.logs) {
              logger.error('Logs de AppScript:', appsScriptResponseData.logs);
            }
            return createResponse(
              { 
                error: "Error al generar documentos: No se recibieron URLs válidas",
                logs: appsScriptResponseData?.logs || []
              },
              500
            );
          }
        } else {
          logger.error(
            `Error al generar documentos para contractID: ${contractID}. Status: ${appsScriptResponse.status}`
          );
          const errorData = await appsScriptResponse.json();
          if (errorData?.logs) {
            logger.error('Logs de AppScript:', errorData.logs);
          }
          return createResponse(
            { 
              error: `Error al generar documentos: ${errorData?.error || 'Error desconocido'}`,
              logs: errorData?.logs || []
            },
            500
          );
        }
      } catch (error) {
        logger.error(
          `Error al interactuar con Apps Script para contractID: ${contractID}:`,
          error
        );
        return createResponse(
          { 
            error: `Error al interactuar con Apps Script: ${error.message}`,
            logs: []
          },
          500
        );
      }
    } else if (existingPaymentId) {
      logger.info('Pago existente encontrado, omitiendo generación y notificaciones', contractID);
    }

    logger.info('Proceso completado', contractID);
    return createResponse(
      {
        message: "Payment details updated successfully, document generation and follow-up initiated (if applicable).",
        paymentId: paymentData.payment_id,
        fechaDePago: paymentData.fechaDePago,
      },
      200
    );
  } catch (error) {
    logger.error(`Error en el procesamiento: ${error.message}`, contractID);
    return createResponse(
      { error: error.message },
      500
    );
  }
}
