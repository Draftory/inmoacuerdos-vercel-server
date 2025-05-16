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
  console.log("Request Headers (Origin):", req.headers.get("origin"));

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
    console.log("Attempting to parse request body...");
    const requestBody = await req.json();
    const { contractID, memberstackID } = requestBody;
    console.log("Received data for Token payment update (Server-Side):", {
      contractID,
      memberstackID,
    });

    if (!contractID || !memberstackID) {
      console.error(
        "Error: contractID and memberstackID are required in the request body."
      );
      throw new Error(
        "contractID and memberstackID are required in the request body."
      );
    }

    const googleCredentialsBase64 =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;

    if (!googleCredentialsBase64) {
      console.error("Error: GOOGLE_APPLICATION_CREDENTIALS_SECRET is not set");
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

    console.log("Fetching header row...");
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });

    const headerRow = headerResponse.data?.values?.[0];
    console.log("Header Row:", headerRow);

    if (!headerRow || headerRow.length === 0) {
      console.error("Error: Header row not found in the spreadsheet.");
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
      console.error("Error: contractID column not found in the header.");
      throw new Error("contractID column not found in the header.");
    }
    if (memberstackIDColumnIndex === -1) {
      console.error("Error: MemberstackID column not found in the header.");
      throw new Error("MemberstackID column not found in the header.");
    }
    if (tipoDePagoColumnIndex === -1) {
      console.error("Error: tipoDePago column not found in the header.");
      throw new Error("tipoDePago column not found in the header.");
    }
    if (estadoDePagoColumnIndex === -1) {
      console.error("Error: estadoDePago column not found in the header.");
      throw new Error("estadoDePago column not found in the header.");
    }
    if (paymentIdColumnIndex === -1) {
      console.error("Error: payment_id column not found in the header.");
      throw new Error("payment_id column not found in the header.");
    }
    if (fechaDePagoColumnIndex === -1) {
      console.error("Error: fechaDePago column not found in the header.");
      throw new Error("fechaDePago column not found in the header.");
    }
    if (statusColumnIndex === -1) {
      console.warn("Warning: status column not found in the header.");
    }

    console.log("Fetching all rows...");
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Adjust the range to cover all potential columns
    });

    const allRows = allRowsResponse.data?.values || [];

    let rowIndex = -1;
    let rowDataToPass;
    for (let i = 1; i < allRows.length; i++) {
      if (
        allRows[i][contractIDColumnIndex] === contractID &&
        allRows[i][memberstackIDColumnIndex] === memberstackID
      ) {
        rowIndex = i + 1; // +1 to account for header row and 1-based indexing
        rowDataToPass = allRows[i];
        console.log("Found matching row at index:", rowIndex);
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
      if (statusColumnIndex !== -1) {
        updatedRowValues[statusColumnIndex] = "Contrato";
      }

      const lastColumnLetter = getColumnLetter(updatedRowValues.length);

      console.log("Updating spreadsheet row:", rowIndex);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:${lastColumnLetter}${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [updatedRowValues],
        },
      });
      console.log("Spreadsheet updated successfully.");

      // --- Trigger Google Apps Script function (Don't wait for full completion) ---
      if (
        APPS_SCRIPT_URL &&
        VERCEL_API_SECRET &&
        rowDataToPass &&
        headerRow &&
        spreadsheetId &&
        sheetName &&
        rowIndex
      ) {
        console.log("Attempting to trigger Google Apps Script...");
        fetch(APPS_SCRIPT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            secret: VERCEL_API_SECRET,
            spreadsheetId: spreadsheetId,
            sheetName: sheetName,
            rowNumber: rowIndex,
            rowData: rowDataToPass,
            headers: headerRow,
          }),
        })
          .then((response) => {
            console.log(
              "Google Apps Script trigger response:",
              response.status,
              response.statusText
            );
            if (!response.ok) {
              console.error(
                "Error triggering Google Apps Script:",
                response.status,
                response.statusText
              );
            }
          })
          .catch((error) => {
            console.error(
              "Error sending request to Google Apps Script:",
              error
            );
            // Log the error, but don't block the response to the frontend
          });
        console.log("Google Apps Script trigger initiated (non-blocking).");
      } else {
        console.warn(
          "Missing configuration to trigger generateDocumentsForRow."
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
