import { google } from 'googleapis';
import { NextResponse } from 'next/server';

// List of allowed origins
const allowedOrigins = [
  'https://www.inmoacuerdos.com',
  'https://inmoacuerdos.webflow.io'
];

export async function OPTIONS(req) {
  const origin = req.headers.get('origin');
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  return new NextResponse(null, {
    status: 204,
    headers: headers,
  });
}

export async function POST(req) {
  console.log("Starting API request to Google Sheets");

  try {
    const origin = req.headers.get('origin');
    const headers = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Your Google Sheets logic here
    const formData = await req.json();
    const contractID = formData.contractID;

    if (!contractID) {
      return new NextResponse(JSON.stringify({ error: "Missing contractID" }), {
        status: 400,
        headers: headers,
      });
    }

    // Decode Google Service Account Credentials
    const credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS, "base64").toString()
    );

    // Authenticate with Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // Spreadsheet Details
    const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;

    // Fetch all rows to check if contractID exists
    const readResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
    });

    const rows = readResponse.data.values || [];

    // Get the header row to dynamically find the index of the contractID column
    const headersRow = rows[0] || [];
    const contractIDColumnIndex = headersRow.indexOf("contractID");

    if (contractIDColumnIndex === -1) {
      return new NextResponse(JSON.stringify({ error: "contractID column not found" }), {
        status: 400,
        headers: headers,
      });
    }

    // Check if contractID already exists in any row
    const existingRowIndex = rows.findIndex(
      (row) => row[contractIDColumnIndex] === contractID
    );

    if (existingRowIndex === -1) {
      // Contract ID doesn't exist, create a new row
      const newRow = Object.values(formData);
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: "RAW",
        requestBody: {
          values: [newRow],
        },
      });

      return new NextResponse(JSON.stringify({ message: "New row added successfully." }), {
        status: 200,
        headers: headers,
      });
    } else {
      // Contract ID exists, update the existing row
      const updatedRow = Object.values(formData);
      const updateRange = `${sheetName}!A${
        existingRowIndex + 1
      }:Z${existingRowIndex + 1}`;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: updateRange,
        valueInputOption: "RAW",
        requestBody: {
          values: [updatedRow],
        },
      });

      return new NextResponse(JSON.stringify({ message: "Row updated successfully." }), {
        status: 200,
        headers: headers,
      });
    }
  } catch (error) {
    console.error("Error:", error);
    return new NextResponse(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: headers,
    });
  }
}