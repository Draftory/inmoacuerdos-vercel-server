import { google } from "googleapis";
import { NextResponse } from "next/server";

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

// Environment variables
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_GENERATE_DOC_URL;
const VERCEL_API_SECRET = process.env.VERCEL_API_SECRET; // Asegúrate de que esta variable esté definida en Vercel

export async function OPTIONS(req) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type", // Ya no necesitamos X-Vercel-Secret aquí
  };

  return new NextResponse(null, {
    status: 204,
    headers: headers,
  });
}

export async function POST(req) {
  console.log(
    "Starting API request to Google Sheets for payment update (CON seguridad - Secreto en el body)"
  );
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type", // Ya no necesitamos X-Vercel-Secret aquí
  };

  // --- **IMPORTANT: Ensure VERCEL_API_SECRET is set in your Vercel Environment Variables** ---
  if (!VERCEL_API_SECRET) {
    console.error(
      "Error: VERCEL_API_SECRET environment variable is not set in Vercel."
    );
    return new NextResponse(
      JSON.stringify({ error: "Server configuration error." }),
      {
        status: 500,
        headers: headers,
      }
    );
  }

  try {
    const paymentData = await req.json();
    console.log("Request Body:", paymentData);

    const { payment_id, estadoDePago, fechaDePago, contractID, tipoDePago } =
      paymentData;

    console.log("contractID recibido:", contractID);
    console.log("tipoDePago recibido:", tipoDePago);
    console.log("Datos de pago recibidos (Server-Side):", paymentData);

    if (!contractID) {
      throw new Error("contractID is missing in the request body.");
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

    console.log(
      "GOOGLE_APPLICATION_CREDENTIALS_SECRET decoded and ready for use"
    );

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: "https://www.googleapis.com/auth/spreadsheets",
    });

    const client = await auth.getClient();
    console.log("Authenticated with Google Sheets API");

    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;
    console.log("Spreadsheet ID:", spreadsheetId);
    console.log("Sheet Name:", sheetName);

    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    const headerRow = headerResponse.data?.values?.[0];
    console.log("Header Row:", headerRow);

    if (!headerRow || headerRow.length === 0) {
      throw new Error("Header row not found in the spreadsheet.");
    }

    const contractIDColumnIndex = headerRow.indexOf("contractID");
    const paymentIdColumnIndex = headerRow.indexOf("payment_id");
    const estadoDePagoColumnIndex = headerRow.indexOf("estadoDePago");
    const fechaDePagoColumnIndex = headerRow.indexOf("fechaDePago");
    const tipoDePagoColumnIndex = headerRow.indexOf("tipoDePago");
    const statusColumnIndex = headerRow.indexOf("status");

    if (contractIDColumnIndex === -1) {
      throw new Error("contractID column not found in the header.");
    }
    if (paymentIdColumnIndex === -1) {
      throw new Error("payment_id column not found in the header.");
    }
    if (estadoDePagoColumnIndex === -1) {
      throw new Error("estadoDePago column not found in the header.");
    }
    if (fechaDePagoColumnIndex === -1) {
      throw new Error("fechaDePago column not found in the header.");
    }
    if (tipoDePagoColumnIndex === -1) {
      console.log(
        "Warning: tipoDePago column not found in the header. Skipping update for this column."
      );
    }
    if (statusColumnIndex === -1) {
      throw new Error("status column not found in the header.");
    }

    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Adjust the range to cover all columns
    });
    const allRows = allRowsResponse.data?.values || [];

    let rowIndex = -1;
    let rowDataToPass;
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][contractIDColumnIndex] === contractID) {
        rowIndex = i + 1;
        rowDataToPass = allRows[i];
        break;
      }
    }

    if (rowIndex !== -1) {
      const updatedRow = allRows[rowIndex - 1] || [];

      updatedRow[paymentIdColumnIndex] =
        payment_id || updatedRow[paymentIdColumnIndex] || "";
      updatedRow[estadoDePagoColumnIndex] =
        estadoDePago === "approved"
          ? "Pagado"
          : estadoDePago || updatedRow[estadoDePagoColumnIndex] || "";
      updatedRow[fechaDePagoColumnIndex] = fechaDePago
        ? new Date(fechaDePago).toISOString()
        : updatedRow[fechaDePagoColumnIndex] || "";
      if (tipoDePagoColumnIndex !== -1 && tipoDePago !== undefined) {
        updatedRow[tipoDePagoColumnIndex] = tipoDePago;
      }
      if (estadoDePago && estadoDePago.toLowerCase() === "approved") {
        updatedRow[statusColumnIndex] = "Contrato";
      }
      const lastColumnLetter = getColumnLetter(updatedRow.length);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:${lastColumnLetter}${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [updatedRow],
        },
      });
      console.log(
        `Payment details updated for contractID: ${contractID} in row ${rowIndex}.`
      );

      // --- Trigger Google Apps Script function WITH secret in body ---
      if (APPS_SCRIPT_URL && VERCEL_API_SECRET) {
        try {
          const response = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              secret: VERCEL_API_SECRET, // Incluir el secreto en el body
              spreadsheetId: spreadsheetId,
              sheetName: sheetName,
              rowNumber: rowIndex,
              rowData: rowDataToPass,
              headers: headerRow,
            }),
          });

          if (response.ok) {
            const scriptResult = await response.json();
            console.log(
              "Google Apps Script triggered successfully (SECURE - Secreto en body):",
              scriptResult
            );
          } else {
            console.error(
              "Error triggering Google Apps Script (SECURE - Secreto en body):",
              response.status,
              response.statusText
            );
            // Optionally handle the error
          }
        } catch (error) {
          console.error(
            "Error sending request to Google Apps Script (SECURE - Secreto en body):",
            error
          );
          // Optionally handle the error
        }
      } else {
        console.warn(
          "APPS_SCRIPT_URL or VERCEL_API_SECRET environment variable not set. Skipping trigger of generateDocumentsForRow."
        );
      }
      // --- End Trigger ---

      return new NextResponse(
        JSON.stringify({ message: "Payment details updated successfully." }),
        {
          status: 200,
          headers: headers,
        }
      );
    } else {
      console.log(`contractID: ${contractID} not found in the spreadsheet.`);
      return new NextResponse(
        JSON.stringify({ error: "ContractID not found in the spreadsheet." }),
        {
          status: 404,
          headers: headers,
        }
      );
    }
  } catch (error) {
    console.error(
      "POST Error (Update Payment Status - SECURE - Secreto en body):",
      error
    );
    return new NextResponse(
      JSON.stringify({ error: error.message, stack: error.stack }),
      {
        status: 500,
        headers: headers,
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
