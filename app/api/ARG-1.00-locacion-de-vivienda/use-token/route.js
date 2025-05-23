// app/api/ARG-1.00-locacion-de-vivienda/use-token/route.js
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
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
    console.log(
      `[use-token] Inicio del proceso para contractID: ${contractID}`
    );

    if (!contractID || !memberstackID) {
      console.error(`[use-token] Error: contractID o memberstackID faltantes.`);
      return createErrorResponse(
        "contractID and memberstackID are required.",
        400
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
      console.error(
        `[use-token] Error: Columnas esenciales (contractID o MemberstackID) no encontradas en la hoja.`
      );
      return createErrorResponse(
        "Columnas esenciales no encontradas en la hoja de cálculo.",
        500
      );
    }

    const { rowIndex } = await findRowByColumns(
      sheets,
      spreadsheetId,
      sheetName,
      ["contractID", "MemberstackID"],
      [contractID, memberstackID]
    );

    if (rowIndex === -1) {
      console.warn(
        `[use-token] Advertencia: No se encontró entrada para contractID: ${contractID} y memberstackID: ${memberstackID}.`
      );
      return createErrorResponse("No se encontró entrada coincidente.", 404);
    }

    const updatedRowValues = [
      ...((
        await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetName}!${rowIndex}:${rowIndex}`,
        })
      ).data?.values?.[0] || []),
    ];
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
    console.log(
      `[use-token] Hoja de cálculo actualizada para contractID: ${contractID}`
    );

    if (
      !existingPaymentId &&
      process.env.APPS_SCRIPT_GENERATE_DOC_URL &&
      process.env.VERCEL_API_SECRET
    ) {
      console.log(
        `[use-token] Solicitando generación de documentos para contractID: ${contractID}`
      );
      const dataToSendToAppsScript = {
        secret: process.env.VERCEL_API_SECRET,
        spreadsheetId: spreadsheetId,
        sheetName: sheetName,
        rowNumber: rowIndex,
        rowData: updatedRowValues,
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
          const pdfUrl = appsScriptResponseData?.pdfUrl;
          const docUrl = appsScriptResponseData?.docUrl;
          console.log(
            `[use-token] Documentos generados para contractID: ${contractID}. PDF: ${!!pdfUrl}, DOC: ${!!docUrl}`
          );

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
            console.log(
              `[use-token] Webflow actualizado para contractID: ${contractID}. Resultado: ${webflowUpdateResult ? "Éxito" : "Advertencia"}`
            );
          } else {
            console.warn(
              `[use-token] Advertencia: No se actualizará Webflow para contractID: ${contractID}.`
            );
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
            console.log(
              `[use-token] Notificación de correo electrónico enviada para contractID: ${contractID}. Éxito: ${emailSent}`
            );
          } else {
            console.warn(
              `[use-token] Advertencia: No se enviará notificación por correo electrónico para contractID: ${contractID}.`
            );
          }
        } else {
          console.error(
            `[use-token] Error al generar documentos para contractID: ${contractID}. Status: ${appsScriptResponse.status}`
          );
        }
      } catch (error) {
        console.error(
          `[use-token] Error al interactuar con Apps Script para contractID: ${contractID}:`,
          error
        );
      }
    } else if (existingPaymentId) {
      console.log(
        `[use-token] Pago existente encontrado para contractID: ${contractID}. Omitiendo generación y notificaciones.`
      );
    } else {
      console.warn(
        `[use-token] Advertencia: No se generarán documentos para contractID: ${contractID}. Configuración faltante.`
      );
    }

    console.log(
      `[use-token] Proceso completado para contractID: ${contractID}`
    );
    return createSuccessResponse({
      message:
        "Payment details updated successfully, follow-up initiated (if applicable).",
      paymentId: paymentId,
      fechaDePago: nowArgentina,
    });
  } catch (error) {
    console.error(
      `[use-token] Error general para contractID: ${contractID}:`,
      error
    );
    return createErrorResponse(error.message);
  }
}
