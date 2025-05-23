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
  console.log(
    "Starting API request for Token payment update, document generation, Webflow update, and email"
  );
  const origin = req.headers.get("origin");
  const responseHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Environment variable warnings
  if (
    !process.env.VERCEL_API_SECRET &&
    process.env.APPS_SCRIPT_GENERATE_DOC_URL
  ) {
    console.warn(
      "Warning: VERCEL_API_SECRET environment variable is not set in Vercel, but APPS_SCRIPT_GENERATE_DOC_URL is. The Google Apps Script for document generation will NOT be triggered."
    );
  }
  if (
    !process.env.WEBFLOW_API_TOKEN &&
    process.env.WEBFLOW_USER_COLLECTION_ID
  ) {
    console.warn(
      "Warning: WEBFLOW_API_TOKEN environment variable is not set in Vercel, but WEBFLOW_USER_COLLECTION_ID is. Webflow will NOT be updated."
    );
  }
  if (!process.env.RESEND_API_KEY && process.env.RESEND_EMAIL_FROM) {
    console.warn(
      "Warning: RESEND_API_KEY environment variable is not set in Vercel, but RESEND_EMAIL_FROM is. Emails might not be sent correctly by the custom endpoint."
    );
  }

  try {
    const { contractID, memberstackID } = await req.json();
    console.log("Received data:", { contractID, memberstackID });

    if (!contractID || !memberstackID) {
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

    if (
      contractIDColumnIndex === -1 ||
      memberstackIDColumnIndex === -1 ||
      tipoDePagoColumnIndex === -1 ||
      estadoDePagoColumnIndex === -1 ||
      paymentIdColumnIndex === -1 ||
      fechaDePagoColumnIndex === -1
    ) {
      return createErrorResponse(
        "One or more essential columns are missing in the Google Sheet.",
        500
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
      return createErrorResponse(
        "Matching contractID and MemberstackID not found.",
        404
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

    let appsScriptResponseData = {};
    if (
      !existingPaymentId &&
      process.env.APPS_SCRIPT_GENERATE_DOC_URL &&
      process.env.VERCEL_API_SECRET
    ) {
      const dataToSendToAppsScript = {
        secret: process.env.VERCEL_API_SECRET,
        spreadsheetId: spreadsheetId,
        sheetName: sheetName,
        rowNumber: rowIndex,
        rowData: rowDataToPass,
        headers: headerRow,
      };
      console.log(
        "Sending request to Apps Script for document generation:",
        dataToSendToAppsScript
      );
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
          appsScriptResponseData = await appsScriptResponse.json();
          console.log("Apps Script response:", appsScriptResponseData);

          const pdfUrl = appsScriptResponseData?.pdfUrl;
          const docUrl = appsScriptResponseData?.docUrl;
          const webflowApiToken = process.env.WEBFLOW_API_TOKEN;

          if (
            webflowApiToken &&
            process.env.WEBFLOW_USER_COLLECTION_ID &&
            pdfUrl &&
            docUrl
          ) {
            await interactWithWebflow(
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
          } else {
            console.warn(
              "WEBFLOW_API_TOKEN or collection ID not configured, or document URLs missing. Skipping Webflow update."
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
            await sendEmailNotification(
              emailMember,
              emailGuest,
              pdfUrl,
              docUrl,
              updatedRowValues,
              headerRow
            );
          } else {
            console.warn(
              "Document URLs missing or no recipient emails found in Google Sheet. Skipping email sending."
            );
          }
        } else {
          console.error(
            "Error calling Apps Script:",
            appsScriptResponse.statusText,
            await appsScriptResponse.text()
          );
        }
      } catch (error) {
        console.error("Error sending request to Apps Script:", error);
      }
    } else if (existingPaymentId) {
      console.log(
        "Payment ID already exists. Skipping document generation, Webflow update, and email."
      );
    } else {
      console.warn(
        "APPS_SCRIPT_GENERATE_DOC_URL or VERCEL_API_SECRET not configured for document generation."
      );
    }

    return createSuccessResponse({
      message:
        "Payment details updated successfully, follow-up initiated (if applicable).",
      paymentId: paymentId,
      fechaDePago: nowArgentina,
    });
  } catch (error) {
    return createErrorResponse(error.message);
  }
}
