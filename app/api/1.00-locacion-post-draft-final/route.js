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
  const origin = req.headers.get('origin');
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    const { values } = await req.json(); // Extract 'values' directly
    console.log("Received values (Server-Side):", values);

    if (!values || !Array.isArray(values) || values.length === 0) {
      throw new Error('Invalid or missing "values" in the request body.');
    }

    const newRow = values[0]; // Assuming the first element of 'values' is the row data.
    console.log("Row to add:", newRow);

    // Retrieve the Google service account credentials from environment variable
    const googleCredentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;

    if (!googleCredentialsBase64) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_SECRET is not set');
    }

    // Decode the Base64 string into JSON
    const googleCredentialsJson = Buffer.from(googleCredentialsBase64, 'base64').toString('utf-8');

    // Parse the JSON string to an object
    const credentials = JSON.parse(googleCredentialsJson);

    console.log("GOOGLE_APPLICATION_CREDENTIALS_SECRET decoded and ready for use");

    // Authenticate with Google Sheets API using Service Account
    const auth = new google.auth.GoogleAuth({
      credentials, // Use the credentials directly from memory
      scopes: 'https://www.googleapis.com/auth/spreadsheets', // Full access
    });

    const client = await auth.getClient();
    console.log("Authenticated with Google Sheets API");

    const sheets = google.sheets({ version: 'v4', auth: client });

    // Spreadsheet Details
    console.log("Retrieving spreadsheet details");
    const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;
    console.log("Spreadsheet ID:", spreadsheetId);
    console.log("Sheet Name:", sheetName);

    // Append the new row to the spreadsheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: "RAW",
      requestBody: {
        values: [newRow],
      },
    });
    console.log("New row added successfully");

    return new NextResponse(JSON.stringify({ message: "New row added successfully." }), {
      status: 200,
      headers: headers,
    });

  } catch (error) {
    console.error("POST Error:", error);
    return new NextResponse(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: headers,
    });
  }
}