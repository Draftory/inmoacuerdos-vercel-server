// app/api/ARG-1.00-locacion-de-vivienda/use-token/route.js
import { google } from "googleapis";
import { NextResponse } from "next/server";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import {
  interactWithWebflow,
  sendEmailNotification,
} from "../../../../utils/apiUtils";
import { getColumnLetter } from "../../../../utils/helpers";

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

  return new NextResponse(null, {
    status: 204,
    headers: headers,
  });
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

  // NOTE: RESEND_API_KEY is not directly used here for sending, but for the custom endpoint.
  // The warning below is still relevant if the custom endpoint relies on it.
  if (!process.env.RESEND_API_KEY && process.env.RESEND_EMAIL_FROM) {
    console.warn(
      "Warning: RESEND_API_KEY environment variable is not set in Vercel, but RESEND_EMAIL_FROM is. Emails might not be sent correctly by the custom endpoint."
    );
  }

  try {
    const { contractID, memberstackID } = await req.json();
    console.log("Received data:", { contractID, memberstackID });

    if (!contractID || !memberstackID) {
      throw new Error(
        "contractID and memberstackID are required in the request body."
      );
    }

    const googleCredentialsBase64 =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;

    if (!googleCredentialsBase64) {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS_SECRET is not set");
    }

    const googleCredentialsJson = Buffer.from(
      googleCredentialsBase64,
      "base64"
    ).toString("utf-8");
    const credentials = JSON.parse(googleCredentialsJson);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: "https://www.googleapis.com/auth/spreadsheets",
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;

    // Fetch header row to find column indices
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    const headerRow = headerResponse.data?.values?.[0] || [];
    const contractIDColumnIndex = headerRow.indexOf("contractID");
    const memberstackIDColumnIndex = headerRow.indexOf("MemberstackID");
    const tipoDePagoColumnIndex = headerRow.indexOf("tipoDePago");
    const estadoDePagoColumnIndex = headerRow.indexOf("estadoDePago");
    const paymentIdColumnIndex = headerRow.indexOf("payment_id");
    const fechaDePagoColumnIndex = headerRow.indexOf("fechaDePago");
    const pdfFileColumnIndex = headerRow.indexOf("PDFFile");
    const docFileColumnIndex = headerRow.indexOf("DOCFile");
    const editlinkColumnIndex = headerRow.indexOf("Editlink");

    // Validate essential columns
    if (contractIDColumnIndex === -1)
      throw new Error("contractID column not found.");
    if (memberstackIDColumnIndex === -1)
      throw new Error("MemberstackID column not found.");
    if (tipoDePagoColumnIndex === -1)
      throw new Error("tipoDePago column not found.");
    if (estadoDePagoColumnIndex === -1)
      throw new Error("estadoDePago column not found.");
    if (paymentIdColumnIndex === -1)
      throw new Error("payment_id column not found.");
    if (fechaDePagoColumnIndex === -1)
      throw new Error("fechaDePago column not found.");

    // Warn for non-essential but useful columns
    if (pdfFileColumnIndex === -1) console.warn("PDFFile column not found.");
    if (docFileColumnIndex === -1) console.warn("DOCFile column not found.");
    if (editlinkColumnIndex === -1)
      console.warn("Editlink column not found in Google Sheet.");

    // Fetch all rows to find the matching contract
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Fetch a wide range to cover all potential columns
    });
    const allRows = allRowsResponse.data?.values || [];

    let rowIndex = -1;
    let rowDataToPass; // This will hold the original row data before updates
    let existingPaymentId;
    for (let i = 1; i < allRows.length; i++) {
      if (
        allRows[i][contractIDColumnIndex] === contractID &&
        allRows[i][memberstackIDColumnIndex] === memberstackID
      ) {
        rowIndex = i + 1; // Google Sheets row index is 1-based
        rowDataToPass = allRows[i]; // Store the full row data
        existingPaymentId = allRows[i][paymentIdColumnIndex];
        break;
      }
    }

    if (rowIndex !== -1) {
      // Update payment details in Google Sheet
      const paymentId = uuidv4();
      const nowArgentina = new Date().toLocaleString("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
      });

      const updatedRowValues = allRows[rowIndex - 1] || []; // Get the current row data for update
      updatedRowValues[tipoDePagoColumnIndex] = "Token";
      updatedRowValues[estadoDePagoColumnIndex] = "Pagado";
      updatedRowValues[paymentIdColumnIndex] = paymentId;
      updatedRowValues[fechaDePagoColumnIndex] = nowArgentina;

      const lastColumnLetter = getColumnLetter(updatedRowValues.length);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:${lastColumnLetter}${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [updatedRowValues] },
      });

      console.log(
        `Payment details updated for contractID: ${contractID}, MemberstackID: ${memberstackID} in row ${rowIndex}. Payment ID: ${paymentId}, Fecha de Pago: ${nowArgentina}`
      );

      let appsScriptResponseData = {};
      // Trigger document generation via Google Apps Script only if no existing payment ID
      if (
        !existingPaymentId &&
        process.env.APPS_SCRIPT_GENERATE_DOC_URL &&
        process.env.VERCEL_API_SECRET
      ) {
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
            const pdfUrl = appsScriptResponseData?.pdfUrl;
            const docUrl = appsScriptResponseData?.docUrl;

            // Update Google Sheets with DOC and PDF links if available
            if (
              pdfUrl &&
              docUrl &&
              pdfFileColumnIndex !== -1 &&
              docFileColumnIndex !== -1
            ) {
              const updateLinksRange = `${sheetName}!${getColumnLetter(docFileColumnIndex + 1)}${rowIndex}:${getColumnLetter(pdfFileColumnIndex + 1)}${rowIndex}`;
              await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateLinksRange,
                valueInputOption: "RAW",
                requestBody: { values: [[docUrl, pdfUrl]] },
              });
              console.log("Google Sheets updated with DOC and PDF links.");
            }

            // Webflow Integration
            const webflowApiToken = process.env.WEBFLOW_API_TOKEN;
            if (
              webflowApiToken &&
              process.env.WEBFLOW_USER_COLLECTION_ID &&
              pdfUrl &&
              docUrl &&
              !existingPaymentId // Only update/create in Webflow if this is a new payment
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
                "WEBFLOW_API_TOKEN or collection ID not configured, or document URLs missing, or payment already processed. Skipping Webflow update."
              );
            }

            // Resend Email Integration
            if (pdfUrl && docUrl && !existingPaymentId) {
              await sendEmailNotification(
                updatedRowValues,
                headerRow,
                pdfUrl,
                docUrl
              );
            } else {
              console.warn(
                "Document URLs missing or payment already processed. Skipping email sending via custom endpoint."
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
          console.error("Error during Apps Script call:", error);
        }
      }

      if (existingPaymentId) {
        console.log(
          "Payment ID already exists. Skipping document generation, Webflow update, and email."
        );
      } else if (
        !process.env.APPS_SCRIPT_GENERATE_DOC_URL ||
        !process.env.VERCEL_API_SECRET
      ) {
        console.warn(
          "APPS_SCRIPT_GENERATE_DOC_URL or VERCEL_API_SECRET not configured for document generation."
        );
      }

      return new NextResponse(
        JSON.stringify({
          message:
            "Payment details updated successfully, document generation and follow-up initiated (if applicable).",
          paymentId: paymentId,
          fechaDePago: nowArgentina,
        }),
        { status: 200, headers: responseHeaders }
      );
    } else {
      console.log(
        `contractID: ${contractID} and MemberstackID: ${memberstackID} not found in the spreadsheet.`
      );
      return new NextResponse(
        JSON.stringify({
          error:
            "Matching contractID and MemberstackID not found in the spreadsheet.",
        }),
        { status: 404, headers: responseHeaders }
      );
    }
  } catch (error) {
    console.error(
      "POST Error (Update Token Payment with Doc Gen/Email/Webflow):",
      error
    );
    return new NextResponse(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: responseHeaders,
    });
  }
}
