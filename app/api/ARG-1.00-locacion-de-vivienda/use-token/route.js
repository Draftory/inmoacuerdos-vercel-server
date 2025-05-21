import { google } from "googleapis";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

// Environment variables
const APPS_SCRIPT_GENERATE_DOC_URL = process.env.APPS_SCRIPT_GENERATE_DOC_URL;
const VERCEL_API_SECRET = process.env.VERCEL_API_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_EMAIL_FROM = process.env.RESEND_EMAIL_FROM;
const LOCACION_POST_DATABASE_SHEET_ID =
  process.env.LOCACION_POST_DATABASE_SHEET_ID;
const LOCACION_POST_DATABASE_SHEET_NAME =
  process.env.LOCACION_POST_DATABASE_SHEET_NAME;

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
    "Starting API request for Token payment update and potential document generation/email"
  );
  const origin = req.headers.get("origin");
  const responseHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // --- **IMPORTANT: Ensure VERCEL_API_SECRET is set in your Vercel Environment Variables** ---
  if (!VERCEL_API_SECRET && APPS_SCRIPT_GENERATE_DOC_URL) {
    console.warn(
      "Warning: VERCEL_API_SECRET environment variable is not set in Vercel, but APPS_SCRIPT_GENERATE_DOC_URL is. The Google Apps Script for document generation will NOT be triggered."
    );
  }

  try {
    const { contractID, memberstackID, emailMember, emailGuest } =
      await req.json();
    console.log("Received data:", {
      contractID,
      memberstackID,
      emailMember,
      emailGuest,
    });

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

    const spreadsheetId = LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = LOCACION_POST_DATABASE_SHEET_NAME;

    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    const headerRow = headerResponse.data?.values?.[0];
    if (!headerRow || headerRow.length === 0) {
      throw new Error("Header row not found in the spreadsheet.");
    }

    const contractIDColumnIndex = headerRow.indexOf("contractID");
    const memberstackIDColumnIndex = headerRow.indexOf("MemberstackID");
    const tipoDePagoColumnIndex = headerRow.indexOf("tipoDePago");
    const estadoDePagoColumnIndex = headerRow.indexOf("estadoDePago");
    const paymentIdColumnIndex = headerRow.indexOf("payment_id");
    const fechaDePagoColumnIndex = headerRow.indexOf("fechaDePago");

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

    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Adjust range as needed
    });
    const allRows = allRowsResponse.data?.values || [];

    let rowIndex = -1;
    let rowDataToPass;
    let existingPaymentId;
    for (let i = 1; i < allRows.length; i++) {
      if (
        allRows[i][contractIDColumnIndex] === contractID &&
        allRows[i][memberstackIDColumnIndex] === memberstackID
      ) {
        rowIndex = i + 1;
        rowDataToPass = allRows[i];
        existingPaymentId = allRows[i][paymentIdColumnIndex]; // Get existing payment_id
        break;
      }
    }

    if (rowIndex !== -1) {
      const paymentId = uuidv4();
      const nowArgentina = new Date().toLocaleString("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
      });

      const updatedRowValues = allRows[rowIndex - 1] || [];
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
      // --- Call Apps Script for document generation (if payment_id was empty) ---
      if (
        !existingPaymentId &&
        APPS_SCRIPT_GENERATE_DOC_URL &&
        VERCEL_API_SECRET
      ) {
        const dataToSendToAppsScript = {
          secret: VERCEL_API_SECRET,
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
          const appsScriptResponse = await fetch(APPS_SCRIPT_GENERATE_DOC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dataToSendToAppsScript),
          });
          if (appsScriptResponse.ok) {
            appsScriptResponseData = await appsScriptResponse.json();
            console.log("Apps Script response:", appsScriptResponseData);
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
        console.log("Payment ID already exists. Skipping document generation.");
      } else {
        console.warn(
          "APPS_SCRIPT_GENERATE_DOC_URL or VERCEL_API_SECRET not configured for document generation."
        );
      }

      // --- Send Email via Resend (if payment_id was empty and have document URLs) ---
      if (
        !existingPaymentId &&
        RESEND_API_KEY &&
        appsScriptResponseData?.pdfUrl &&
        appsScriptResponseData?.docUrl
      ) {
        const emailData = {
          to: emailMember || emailGuest, // Use provided emails
          from: RESEND_EMAIL_FROM,
          subject: "Your Document is Ready!",
          html: `<p>Here are the links to your documents:</p>
                 <p><a href="${appsScriptResponseData.pdfUrl}">View PDF</a></p>
                 <p><a href="${appsScriptResponseData.docUrl}">View DOC</a></p>`,
        };
        console.log("Sending email via Resend:", emailData);
        try {
          const resendResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(emailData),
          });
          const resendResult = await resendResponse.json();
          console.log("Resend API Response:", resendResult);
          if (!resendResponse.ok) {
            console.error("Error sending email via Resend:", resendResult);
          }
        } catch (error) {
          console.error("Error sending email via Resend:", error);
        }
      } else if (existingPaymentId) {
        console.log("Payment ID already exists. Skipping email sending.");
      } else {
        console.warn("RESEND_API_KEY not configured or document URLs missing.");
      }

      return new NextResponse(
        JSON.stringify({
          message: "Payment details updated successfully.",
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
      "POST Error (Update Token Payment with Doc Gen/Email):",
      error
    );
    return new NextResponse(
      JSON.stringify({ error: error.message, stack: error.stack }),
      {
        status: 500,
        headers: responseHeaders,
      }
    );
  }
}

// Function to convert column number to letter
function getColumnLetter(columnNumber) {
  let columnLetter = "";
  let temp = columnNumber;
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    columnLetter = String.fromCharCode(65 + remainder) + columnLetter;
    temp = Math.floor((temp - 1) / 26);
  }
  return columnLetter;
}
