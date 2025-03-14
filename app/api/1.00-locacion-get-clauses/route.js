import { google } from 'googleapis';
import { NextResponse } from 'next/server';

// List of allowed origins
const allowedOrigins = [
  'https://www.inmoacuerdos.com',
  'https://inmoacuerdos.webflow.io'
];

export async function GET(req) {
  console.log("Starting API request to Google Sheets");

  try {
    // Retrieve the request origin
    const origin = req.headers.get('origin');

    // Define CORS headers dynamically based on the request origin
    const headers = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0], // Use the first allowed origin as fallback
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Retrieve the Google service account credentials from environment variable
    const googleCredentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;

    if (!googleCredentialsBase64) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_SECRET is not set');
    }

    // Decode the Base64 string into JSON
    const googleCredentialsJson = Buffer.from(googleCredentialsBase64, 'base64').toString('utf-8');

    // Parse the JSON string to an object
    const credentials = JSON.parse(googleCredentialsJson);

    console.log("GOOGLE_APPLICATION_CREDENTIALS decoded and ready for use");

    // Authenticate with Google Sheets API using Service Account
    const auth = new google.auth.GoogleAuth({
      credentials, // Use the credentials directly from memory
      scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    });

    const client = await auth.getClient();
    console.log("Authenticated with Google Sheets API");

    const sheets = google.sheets({ version: 'v4', auth: client });

    // Attempt to fetch data from the specified Google Sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Clausulas-locacion-vivienda', // Adjust the range if needed
    });

    console.log("Fetched Google Sheets data:", response.data);

    // Return the response with the appropriate CORS headers
    return NextResponse.json(response.data, { headers });
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error);

    // Return a generic error response with the CORS headers
    return NextResponse.error({ status: 500, headers });
  }
}
