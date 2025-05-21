import { google } from "googleapis";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { webflowUtility } from "https://inmoacuerdos-vercel-server.vercel.app/api/Utilities/webflowGetUpdateCreate"; // Adjust path as needed

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_GENERATE_DOC_URL;
const VERCEL_API_SECRET = process.env.VERCEL_API_SECRET;

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
  console.log("Starting API request for Token payment success");
  const origin = req.headers.get("origin");
  const responseHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (!VERCEL_API_SECRET && APPS_SCRIPT_URL) {
    console.warn(
      "Warning: VERCEL_API_SECRET not set, Apps Script will NOT be triggered."
    );
  }

  try {
    const { contractID, memberstackID } = await req.json();
    console.log("Received data for payment success:", {
      contractID,
      memberstackID,
    });

    if (!contractID || !memberstackID) {
      throw new Error("contractID and memberstackID are required.");
    }

    // --- Google Sheets Update (Payment Info) ---
    const googleCredentials = JSON.parse(
      Buffer.from(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET,
        "base64"
      ).toString("utf-8")
    );
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: "https://www.googleapis.com/auth/spreadsheets",
    });
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });
    const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;
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
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`,
    });
    const allRows = allRowsResponse.data?.values || [];
    let rowIndex = -1;
    let rowDataToPass;

    if (
      contractIDColumnIndex === -1 ||
      memberstackIDColumnIndex === -1 ||
      tipoDePagoColumnIndex === -1 ||
      estadoDePagoColumnIndex === -1 ||
      paymentIdColumnIndex === -1 ||
      fechaDePagoColumnIndex === -1
    ) {
      throw new Error("One or more required columns not found in the header.");
    }

    for (let i = 1; i < allRows.length; i++) {
      if (
        allRows[i][contractIDColumnIndex] === contractID &&
        allRows[i][memberstackIDColumnIndex] === memberstackID
      ) {
        rowIndex = i + 1;
        rowDataToPass = allRows[i];
        const paymentId = uuidv4();
        const nowArgentina = new Date().toLocaleString("en-US", {
          timeZone: "America/Argentina/Buenos_Aires",
        });
        const updatedRowValues = [...allRows[i]];
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
          `Payment updated for contractID: ${contractID}, paymentId: ${paymentId}`
        );

        let appsScriptResult = {};
        // --- Trigger Google Apps Script ---
        if (APPS_SCRIPT_URL && VERCEL_API_SECRET) {
          try {
            const response = await fetch(APPS_SCRIPT_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                secret: VERCEL_API_SECRET,
                spreadsheetId,
                sheetName,
                rowNumber: rowIndex,
                rowData: rowDataToPass,
                headers: headerRow,
              }),
            });
            if (response.ok) {
              appsScriptResult = await response.json();
              console.log(
                "Apps Script triggered successfully:",
                appsScriptResult
              );
              // Apps Script should ideally return the PDF and DOC URLs
            } else {
              console.error(
                "Error triggering Apps Script:",
                response.status,
                response.statusText,
                await response.text()
              );
            }
          } catch (error) {
            console.error("Error sending request to Apps Script:", error);
          }
        } else {
          console.warn(
            "APPS_SCRIPT_URL or VERCEL_API_SECRET not set, skipping Apps Script trigger."
          );
        }

        // --- Interact with Webflow API using utility ---
        const webflowFieldData = {
          estadoDePago: "Pagado", // Update payment status in Webflow
          payment_id: paymentId,
          fechaDePago: nowArgentina,
          pdffile: appsScriptResult?.pdfUrl || null, // Assuming Apps Script returns these
          docfile: appsScriptResult?.docUrl || null,
        };

        const webflowUpdateResult = await webflowUtility(
          contractID,
          webflowFieldData
        );

        if (webflowUpdateResult.success) {
          console.log(
            "Webflow updated successfully after payment:",
            webflowUpdateResult.data
          );
          return new NextResponse(
            JSON.stringify({
              message:
                "Payment updated, Apps Script triggered, and Webflow updated.",
              paymentId,
            }),
            { status: 200, headers }
          );
        } else {
          console.error(
            "Error updating Webflow after payment:",
            webflowUpdateResult.error,
            webflowUpdateResult.details
          );
          return new NextResponse(
            JSON.stringify({
              message:
                "Payment updated and Apps Script triggered, but error updating Webflow.",
              paymentId,
              webflowError: webflowUpdateResult.error,
              webflowDetails: webflowUpdateResult.details,
            }),
            { status: 500, headers }
          );
        }
      }
    }

    return new NextResponse(
      JSON.stringify({
        error: "Matching contractID and memberstackID not found.",
      }),
      { status: 404, headers }
    );
  } catch (error) {
    console.error("POST Error (Payment Success):", error);
    return new NextResponse(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers }
    );
  }
}

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
