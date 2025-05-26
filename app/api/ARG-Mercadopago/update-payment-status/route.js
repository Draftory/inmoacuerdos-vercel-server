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
    console.log("[update-payment-status] Iniciando procesamiento de pago");
    const paymentData = await req.json();
    const { contractID, memberstackID } = paymentData;

    if (!contractID) {
      console.error("[update-payment-status] Error: contractID faltante");
      return createErrorResponse(
        "contractID is required in the request body.",
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
    const { rowIndex, rowData: rowDataToPass } = await findRowByColumns(
      sheets,
      spreadsheetId,
      sheetName,
      ["contractID", "MemberstackID"],
      [contractID, memberstackID]
    );

    if (rowIndex === -1) {
      console.warn(
        `[update-payment-status] No se encontró entrada para contractID: ${contractID}`
      );
      return createErrorResponse(
        "Matching contractID not found in the spreadsheet.",
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

    console.log(
      `[update-payment-status] Hoja actualizada para contractID: ${contractID}`
    );

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
      console.log(
        `[update-payment-status] Pago existente encontrado para contractID: ${contractID}`
      );
    }

    console.log(
      `[update-payment-status] Proceso completado para contractID: ${contractID}`
    );
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
    console.error("[update-payment-status] Error:", error);
    return createErrorResponse(error.message, 500, responseHeaders);
  }
}
