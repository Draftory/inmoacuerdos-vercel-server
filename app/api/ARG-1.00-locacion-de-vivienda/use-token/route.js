// app/api/ARG-1.00-locacion-de-vivienda/use-token/route.js
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

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

// Initialize Memberstack
const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);

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

    // Check if user has tokens available
    const { data: member } = await memberstack.members.retrieve({
      id: memberstackID,
    });

    if (!member) {
      logger.error('Miembro no encontrado en Memberstack', contractID);
      return createErrorResponse(
        "Member not found in Memberstack.",
        404,
        responseHeaders
      );
    }

    const currentTokens = parseInt(member.metaData?.tokens || 0, 10);
    if (currentTokens <= 0) {
      logger.error('Usuario sin tokens disponibles', contractID);
      return createErrorResponse(
        "No tokens available.",
        403,
        responseHeaders
      );
    }

    const sheets = await getGoogleSheetsClient(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET
    );
    const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;
    const headerRow = await getSheetHeaderRow(sheets, spreadsheetId, sheetName);
    const contractIDColumnIndex = headerRow.indexOf("contractID");
    const memberstackIDColumnIndex = headerRow.indexOf("MemberstackID");
    const emailMemberColumnIndex = headerRow.indexOf("emailMember");
    const emailGuestColumnIndex = headerRow.indexOf("emailGuest");
    const tipoDePagoColumnIndex = headerRow.indexOf("tipoDePago");
    const estadoDePagoColumnIndex = headerRow.indexOf("estadoDePago");
    const paymentIdColumnIndex = headerRow.indexOf("payment_id");
    const fechaDePagoColumnIndex = headerRow.indexOf("fechaDePago");
    const pdfFileColumnIndex = headerRow.indexOf("PDFFile");
    const docFileColumnIndex = headerRow.indexOf("DOCFile");
    const editlinkColumnIndex = headerRow.indexOf("Editlink");

    if (contractIDColumnIndex === -1 || memberstackIDColumnIndex === -1) {
      logger.error('Columnas esenciales no encontradas en la hoja', contractID);
      return createErrorResponse(
        "Columnas esenciales no encontradas en la hoja de cálculo.",
        500,
        responseHeaders
      );
    }

    const { rowIndex, rowData: rowDataToPass } = await findRowByColumns(
      sheets,
      spreadsheetId,
      sheetName,
      ["contractID", "MemberstackID"],
      [contractID, memberstackID]
    );

    if (rowIndex === -1) {
      logger.warn('No se encontró entrada coincidente', contractID);
      return createErrorResponse(
        "No se encontró entrada coincidente.",
        404,
        responseHeaders
      );
    }

    const updatedRowValues = [...rowDataToPass];
    const existingPaymentId = updatedRowValues[paymentIdColumnIndex];
    const paymentId = uuidv4();
    const nowArgentina = new Date().toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
    });

    updatedRowValues[tipoDePagoColumnIndex] = "Token";
    updatedRowValues[estadoDePagoColumnIndex] = "Pagado";
    updatedRowValues[paymentIdColumnIndex] = paymentId;
    updatedRowValues[fechaDePagoColumnIndex] = nowArgentina;

    const lastColumnLetter = getColumnLetter(updatedRowValues.length);
    await updateSheetRow(
      sheets,
      spreadsheetId,
      sheetName,
      `A${rowIndex}:${lastColumnLetter}${rowIndex}`,
      updatedRowValues
    );
    logger.info('Hoja de cálculo actualizada', contractID);

    if (
      !existingPaymentId &&
      process.env.APPS_SCRIPT_GENERATE_DOC_URL &&
      process.env.VERCEL_API_SECRET
    ) {
      logger.info('Solicitando generación de documentos', contractID);
      const dataToSendToAppsScript = {
        secret: process.env.VERCEL_API_SECRET,
        spreadsheetId: spreadsheetId,
        sheetName: sheetName,
        rowNumber: rowIndex,
        rowData: rowDataToPass,
        headers: headerRow,
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

          // Decrement token after successful document generation
          const updatedTokens = currentTokens - 1;
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

          const webflowApiToken = process.env.WEBFLOW_API_TOKEN;
          if (
            webflowApiToken &&
            process.env.WEBFLOW_USER_COLLECTION_ID &&
            pdfUrl &&
            docUrl
          ) {
            const webflowUpdateResult = await interactWithWebflow(
              contractID,
              webflowApiToken,
              process.env.WEBFLOW_USER_COLLECTION_ID,
              headerRow,
              updatedRowValues,
              pdfUrl,
              docUrl,
              rowDataToPass,
              sheets,
              spreadsheetId,
              sheetName,
              rowIndex,
              editlinkColumnIndex
            );
            logger.info('Webflow actualizado', contractID);
          } else {
            logger.warn('No se actualizará Webflow', contractID);
          }

          let emailMember =
            emailMemberColumnIndex !== -1
              ? updatedRowValues[emailMemberColumnIndex]
              : undefined;
          let emailGuest =
            emailGuestColumnIndex !== -1
              ? updatedRowValues[emailGuestColumnIndex]
              : undefined;

          if (pdfUrl && docUrl && (emailMember || emailGuest)) {
            const emailSent = await sendEmailNotification(
              emailMember,
              emailGuest,
              pdfUrl,
              docUrl,
              updatedRowValues,
              headerRow
            );
            logger.info('Notificación de correo electrónico enviada', contractID);
          } else {
            logger.warn('No se enviará notificación por correo electrónico', contractID);
          }
        } else {
          logger.error(
            `[use-token] Error al generar documentos para contractID: ${contractID}. Status: ${appsScriptResponse.status}`
          );
        }
      } catch (error) {
        logger.error(
          `[use-token] Error al interactuar con Apps Script para contractID: ${contractID}:`,
          error
        );
      }
    } else if (existingPaymentId) {
      logger.info('Pago existente encontrado, omitiendo generación y notificaciones', contractID);
    } else {
      logger.warn('No se generarán documentos, configuración faltante', contractID);
    }

    logger.info('Proceso completado', contractID);
    return createSuccessResponse(
      {
        message:
          "Payment details updated successfully, follow-up initiated (if applicable).",
        paymentId: paymentId,
        fechaDePago: nowArgentina,
      },
      200,
      responseHeaders
    );
  } catch (error) {
    logger.error(`Error general: ${error.message}`, contractID);
    return createErrorResponse(error.message, 500, responseHeaders);
  }
}
