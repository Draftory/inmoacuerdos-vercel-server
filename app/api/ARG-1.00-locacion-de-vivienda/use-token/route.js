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
  getGoogleSheetsClient,
  getSheetHeaderRow,
  updateSheetRow,
  findRowByColumns,
} from "../../../utils/googleSheetsUtils";
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

  try {
    const { contractID, memberstackID } = await req.json();
    logger.info('Inicio del proceso', contractID);

    if (!contractID || !memberstackID) {
      logger.error('contractID o memberstackID faltantes', contractID);
      return createErrorResponse(
        "contractID and memberstackID are required.",
        400,
        responseHeaders
      );
    }

    // Verificar tokens en Memberstack
    const { data: member } = await memberstack.members.retrieve({
      id: memberstackID,
    });

    if (!member || parseInt(member.metaData?.tokens || 0, 10) <= 0) {
      logger.error('Usuario sin tokens disponibles', contractID);
      return createErrorResponse(
        "No tokens available.",
        403,
        responseHeaders
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
      return createErrorResponse(
        "Contract not found.",
        404,
        responseHeaders
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
        updated_at: new Date().toISOString()
      })
      .eq('contractID', contractID)
      .eq('MemberstackID', memberstackID);

    if (updateError) {
      throw updateError;
    }

    // Generar documentos si es necesario
    if (!contract.payment_id && process.env.APPS_SCRIPT_GENERATE_DOC_URL) {
      const dataToSendToAppsScript = {
        secret: process.env.VERCEL_API_SECRET,
        contractData: contract,
        paymentId: paymentId
      };

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
        const pdfUrl = appsScriptResponseData?.pdfUrl;
        const docUrl = appsScriptResponseData?.docUrl;

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
        if (process.env.WEBFLOW_API_TOKEN && process.env.WEBFLOW_USER_COLLECTION_ID) {
          await interactWithWebflow(
            contractID,
            process.env.WEBFLOW_API_TOKEN,
            process.env.WEBFLOW_USER_COLLECTION_ID,
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
        }
      }
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

    let emailMember =
      contract.emailMember
        ? contract.emailMember
        : undefined;
    let emailGuest =
      contract.emailGuest
        ? contract.emailGuest
        : undefined;

    if (pdfUrl && docUrl && (emailMember || emailGuest)) {
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

    logger.info('Proceso completado', contractID);
    return createSuccessResponse(
      { message: "Token used successfully." },
      responseHeaders
    );
  } catch (error) {
    logger.error(`Error: ${error.message}`, contractID);
    return createErrorResponse(
      error.message,
      500,
      responseHeaders
    );
  }
}
