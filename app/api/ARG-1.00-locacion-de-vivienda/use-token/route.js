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

  // 🔒 Verificación del token de autorización
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${VERCEL_API_SECRET}`) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized request" }), {
      status: 401,
      headers,
    });
  }

  if (!VERCEL_API_SECRET) {
    console.error("Error: VERCEL_API_SECRET not set");
    return new NextResponse(JSON.stringify({ error: "Server config error" }), {
      status: 500,
      headers,
    });
  }

  try {
    const { contractID, memberstackID } = await req.json();
    console.log("Received data:", { contractID, memberstackID });

    if (!contractID || !memberstackID) {
      throw new Error("contractID and memberstackID are required.");
    }

    const googleCredentialsBase64 =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;
    if (!googleCredentialsBase64) {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS_SECRET is not set");
    }

    const credentials = JSON.parse(
      Buffer.from(googleCredentialsBase64, "base64").toString("utf-8")
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

    const headerRow = headerResponse.data?.values?.[0];
    if (!headerRow || headerRow.length === 0) {
      throw new Error("Header row not found in spreadsheet.");
    }

    const colIndex = (name) => headerRow.indexOf(name);
    const indexes = {
      contractID: colIndex("contractID"),
      memberstackID: colIndex("MemberstackID"),
      tipoDePago: colIndex("tipoDePago"),
      estadoDePago: colIndex("estadoDePago"),
      paymentId: colIndex("payment_id"),
      fechaDePago: colIndex("fechaDePago"),
      status: colIndex("status"),
    };

    for (const [key, value] of Object.entries(indexes)) {
      if (value === -1 && key !== "status") {
        throw new Error(`${key} column not found in header.`);
      }
    }

    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`,
    });

    const allRows = allRowsResponse.data?.values || [];

    let rowIndex = -1;
    let rowDataToPass;
    for (let i = 1; i < allRows.length; i++) {
      if (
        allRows[i][indexes.contractID] === contractID &&
        allRows[i][indexes.memberstackID] === memberstackID
      ) {
        rowIndex = i + 1;
        rowDataToPass = allRows[i];
        break;
      }
    }

    if (rowIndex !== -1) {
      const paymentId = uuidv4();
      const nowArgentina = new Date().toLocaleString("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
      });

      const updatedRowValues = allRows[rowIndex - 1] || [];
      updatedRowValues[indexes.tipoDePago] = "Token";
      updatedRowValues[indexes.estadoDePago] = "Pagado";
      updatedRowValues[indexes.paymentId] = paymentId;
      updatedRowValues[indexes.fechaDePago] = nowArgentina;
      if (indexes.status !== -1) {
        updatedRowValues[indexes.status] = "Contrato";
      }

      const lastCol = getColumnLetter(updatedRowValues.length);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:${lastCol}${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: {
          values: [updatedRowValues],
        },
      });

      console.log(
        `Row ${rowIndex} updated for contractID=${contractID}, memberstackID=${memberstackID}`
      );

      const responsePayload = {
        message: "Payment details updated successfully.",
        paymentId,
        fechaDePago: nowArgentina,
      };

      // Trigger Google Apps Script en background
      if (
        APPS_SCRIPT_URL &&
        rowDataToPass &&
        headerRow &&
        spreadsheetId &&
        sheetName &&
        rowIndex
      ) {
        setTimeout(async () => {
          try {
            const scriptResponse = await fetch(APPS_SCRIPT_URL, {
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

            if (scriptResponse.ok) {
              const scriptResult = await scriptResponse.json();
              console.log("✅ Apps Script triggered:", scriptResult);
            } else {
              console.error("❌ Apps Script error:", scriptResponse.status);
            }
          } catch (err) {
            console.error("❌ Error triggering Apps Script:", err);
          }
        }, 1000);
      } else {
        console.warn("Missing info for Apps Script trigger.");
      }

      return new NextResponse(JSON.stringify(responsePayload), {
        status: 200,
        headers,
      });
    } else {
      return new NextResponse(
        JSON.stringify({
          error:
            "Matching contractID and memberstackID not found in spreadsheet.",
        }),
        {
          status: 404,
          headers,
        }
      );
    }
  } catch (error) {
    console.error("POST error:", error);
    return new NextResponse(
      JSON.stringify({ error: error.message, stack: error.stack }),
      {
        status: 500,
        headers,
      }
    );
  }
}

// Converts column number to letter (e.g., 1 -> A, 27 -> AA)
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
