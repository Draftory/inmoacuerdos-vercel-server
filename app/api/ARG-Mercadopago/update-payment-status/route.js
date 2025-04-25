import { google } from "googleapis";
import { NextResponse } from "next/server";

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
  console.log("Starting API request to Google Sheets for payment update");
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    // Leer el cuerpo de la solicitud una sola vez
    const paymentData = await req.json();
    console.log("Request Body:", paymentData);

    // Desestructurar los datos necesarios
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

    // Retrieve all rows to find the row with matching contractID
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Adjust the range to cover all columns
    });
    const allRows = allRowsResponse.data?.values || [];

    let rowIndex = -1;
    for (let i = 1; i < allRows.length; i++) {
      if (allRows[i][contractIDColumnIndex] === contractID) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex !== -1) {
      // Prepare the updated row data
      const updatedRow = allRows[rowIndex - 1] || []; // Get existing row or default to empty array

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
      const lastColumnLetter = getColumnLetter(updatedRow.length); //dynamically calculate the last column

      // Update the entire row in one API call
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
    console.error("POST Error (Update Payment Status):", error);
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
