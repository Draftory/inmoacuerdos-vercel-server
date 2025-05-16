import { google } from "googleapis";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

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
  console.log("Starting API request to Google Sheets for Token payment update");
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // --- Security Check ---
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
    const { contractID, memberstackID } = await req.json();
    console.log("Received data for Token payment update (Server-Side):", {
      contractID,
      memberstackID,
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
    const memberstackIDColumnIndex = headerRow.indexOf("MemberstackID");
    const tipoDePagoColumnIndex = headerRow.indexOf("tipoDePago");
    const estadoDePagoColumnIndex = headerRow.indexOf("estadoDePago");
    const paymentIdColumnIndex = headerRow.indexOf("payment_id");
    const fechaDePagoColumnIndex = headerRow.indexOf("fechaDePago");
    const statusColumnIndex = headerRow.indexOf("status"); // Assuming you have a 'status' column

    if (contractIDColumnIndex === -1) {
      throw new Error("contractID column not found in the header.");
    }
    if (memberstackIDColumnIndex === -1) {
      throw new Error("MemberstackID column not found in the header.");
    }
    if (tipoDePagoColumnIndex === -1) {
      throw new Error("tipoDePago column not found in the header.");
    }
    if (estadoDePagoColumnIndex === -1) {
      throw new Error("estadoDePago column not found in the header.");
    }
    if (paymentIdColumnIndex === -1) {
      throw new Error("payment_id column not found in the header.");
    }
    if (fechaDePagoColumnIndex === -1) {
      throw new Error("fechaDePago column not found in the header.");
    }
    if (statusColumnIndex === -1) {
      console.warn("Warning: status column not found in the header.");
    }

    // Retrieve all rows to search for matching contractID and MemberstackID
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Adjust the range to cover all potential columns
    });

    const allRows = allRowsResponse.data?.values || [];

    // Find the row with the matching contractID and MemberstackID
    let rowIndex = -1;
    let rowDataToPass;
    for (let i = 1; i < allRows.length; i++) {
      if (
        allRows[i][contractIDColumnIndex] === contractID &&
        allRows[i][memberstackIDColumnIndex] === memberstackID
      ) {
        rowIndex = i + 1; // +1 to account for header row and 1-based indexing
        rowDataToPass = allRows[i];
        break;
      }
    }

    if (rowIndex !== -1) {
      const paymentId = uuidv4();
      const nowArgentina = new Date().toLocaleString("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
      });

      // Create an array to hold the updated values for the entire row
      const updatedRowValues = allRows[rowIndex - 1] || []; // Get the existing row or an empty array

      // Update the specific columns
      updatedRowValues[tipoDePagoColumnIndex] = "Token";
      updatedRowValues[estadoDePagoColumnIndex] = "Pagado";
      updatedRowValues[paymentIdColumnIndex] = paymentId;
      updatedRowValues[fechaDePagoColumnIndex] = nowArgentina;
      if (statusColumnIndex !== -1) {
        updatedRowValues[statusColumnIndex] = "Contrato"; // Or your desired status
      }

      const lastColumnLetter = getColumnLetter(updatedRowValues.length);

      // Update the entire row with the modified values
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:${lastColumnLetter}${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [updatedRowValues],
        },
      });

      console.log(
        `Payment details updated for contractID: ${contractID} and MemberstackID: ${memberstackID} in row ${rowIndex}. Payment ID: ${paymentId}, Fecha de Pago: ${nowArgentina}`
      );

      // --- Trigger Google Apps Script function ---
      if (
        APPS_SCRIPT_URL &&
        VERCEL_API_SECRET &&
        rowDataToPass &&
        headerRow &&
        spreadsheetId &&
        sheetName &&
        rowIndex
      ) {
        fetch(APPS_SCRIPT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            secret: VERCEL_API_SECRET, // Include the secret in the body
            spreadsheetId: spreadsheetId,
            sheetName: sheetName,
            rowNumber: rowIndex,
            rowData: rowDataToPass,
            headers: headerRow,
          }),
        }).catch((error) => {
          console.error(
            "Error triggering Google Apps Script (non-blocking):",
            error
          );
        });
        console.log("Google Apps Script trigger initiated (non-blocking).");
      } else {
        console.warn(
          "Missing configuration or data to trigger generateDocumentsForRow from Token Payment."
        );
      }
      // --- End Trigger ---

      return new NextResponse(
        JSON.stringify({
          message:
            "Payment details updated successfully. Document generation initiated.",
          paymentId: paymentId,
          fechaDePago: nowArgentina,
        }),
        {
          status: 200,
          headers: headers,
        }
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
        {
          status: 404,
          headers: headers,
        }
      );
    }
  } catch (error) {
    console.error("POST Error (Update Token Payment):", error);
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
