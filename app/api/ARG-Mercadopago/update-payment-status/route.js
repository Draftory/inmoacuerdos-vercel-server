import { NextResponse } from "next/server";
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
import {
  processMercadoPagoPayment,
  generateDocuments,
  updateDocumentLinks,
} from "../../../utils/mercadopagoUtils";
import { logger } from '../../../utils/logger';

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

// Environment variables
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_GENERATE_DOC_URL;
const VERCEL_API_SECRET = process.env.VERCEL_API_SECRET;
const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_USER_COLLECTION_ID = process.env.WEBFLOW_USER_COLLECTION_ID;
const RESEND_API_KEY = process.env.RESEND_API_KEY; // Used by the custom email endpoint
const RESEND_EMAIL_FROM = process.env.RESEND_EMAIL_FROM; // Used by the custom email endpoint

/**
 * Handles OPTIONS requests for CORS preflight.
 * @param {Request} req - The incoming request object.
 * @returns {NextResponse} A response with appropriate CORS headers.
 */
export async function OPTIONS(req) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return new NextResponse(null, {
    status: 204,
    headers: headers,
  });
}

/**
 * Handles POST requests to update payment status in Google Sheets,
 * trigger document generation via Google Apps Script, update Webflow,
 * and send email notifications.
 * @param {Request} req - The incoming request object containing payment data.
 * @returns {NextResponse} A JSON response indicating the operation's success or failure.
 */
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
    logger.info('Iniciando procesamiento de pago');
    const paymentData = await req.json();
    const { contractID } = paymentData;

    if (!contractID) {
      logger.error('contractID faltante');
      return createErrorResponse(
        "contractID es requerido en el cuerpo de la solicitud.",
        400,
        responseHeaders
      );
    }

    // Inicializar cliente de Google Sheets
    const sheets = await getGoogleSheetsClient(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET
    );
    const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;

    // Obtener encabezados y encontrar la fila
    const headerRow = await getSheetHeaderRow(sheets, spreadsheetId, sheetName);
    const contractIDColumnIndex = headerRow.indexOf("contractID");

    if (contractIDColumnIndex === -1) {
      logger.error('Columna contractID no encontrada', contractID);
      return createErrorResponse(
        "Columna contractID no encontrada en la hoja de cálculo.",
        500,
        responseHeaders
      );
    }

    // Buscar la fila usando findRowByColumns solo por contractID
    const { rowIndex, rowData: rowDataToPass } = await findRowByColumns(
      sheets,
      spreadsheetId,
      sheetName,
      ["contractID"],
      [contractID]
    );

    if (rowIndex === -1) {
      logger.warn('No se encontró entrada coincidente', contractID);
      return createErrorResponse(
        "No se encontró entrada coincidente en la hoja de cálculo.",
        404,
        responseHeaders
      );
    }

    // Procesar el pago y actualizar la hoja
    const {
      updatedRowValues,
      paymentIdToUse,
      fechaDePagoToUse,
      estadoDePagoToUse,
    } = await processMercadoPagoPayment(
      sheets,
      spreadsheetId,
      sheetName,
      headerRow,
      paymentData,
      rowIndex,
      rowDataToPass
    );

    // Actualizar la hoja con los nuevos valores
    const lastColumnLetter = getColumnLetter(updatedRowValues.length);
    await updateSheetRow(
      sheets,
      spreadsheetId,
      sheetName,
      `A${rowIndex}:${lastColumnLetter}${rowIndex}`,
      updatedRowValues
    );

    logger.info('Hoja actualizada', contractID);

    // Verificar si es un pago nuevo y está aprobado
    const existingPaymentId = rowDataToPass[headerRow.indexOf("payment_id")];
    if (estadoDePagoToUse === "Pagado" && !existingPaymentId) {
      // Generar documentos
      const documents = await generateDocuments(
        sheets,
        spreadsheetId,
        sheetName,
        rowIndex,
        rowDataToPass,
        headerRow
      );

      if (documents) {
        const { pdfUrl, docUrl } = documents;

        // Actualizar enlaces de documentos en la hoja
        await updateDocumentLinks(
          sheets,
          spreadsheetId,
          sheetName,
          rowIndex,
          pdfUrl,
          docUrl,
          headerRow.indexOf("PDFFile"),
          headerRow.indexOf("DOCFile")
        );

        // Actualizar Webflow si está configurado
        if (
          process.env.WEBFLOW_API_TOKEN &&
          process.env.WEBFLOW_USER_COLLECTION_ID
        ) {
          await interactWithWebflow(
            contractID,
            process.env.WEBFLOW_API_TOKEN,
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
            headerRow.indexOf("Editlink")
          );
        }

        // Enviar notificaciones por correo
        const emailMember = updatedRowValues[headerRow.indexOf("emailMember")];
        const emailGuest = updatedRowValues[headerRow.indexOf("emailGuest")];
        if (emailMember || emailGuest) {
          await sendEmailNotification(
            emailMember,
            emailGuest,
            pdfUrl,
            docUrl,
            updatedRowValues,
            headerRow
          );
        }
      }
    } else if (existingPaymentId) {
      logger.info('Pago existente encontrado', contractID);
    }

    logger.info('Proceso completado', contractID);
    return createSuccessResponse(
      {
        message:
          "Payment details updated successfully, document generation and follow-up initiated (if applicable).",
        paymentId: paymentIdToUse,
        fechaDePago: fechaDePagoToUse,
      },
      responseHeaders
    );
  } catch (error) {
    logger.error(`Error en el procesamiento: ${error.message}`, contractID);
    return createErrorResponse(error.message, 500, responseHeaders);
  }
}
