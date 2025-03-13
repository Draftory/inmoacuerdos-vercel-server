import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET() {
  console.log("Starting API request to Google Sheets");

  // Define CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://www.inmoacuerdos.com/', // Allow requests from any origin, modify this to be more restrictive if needed
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', // Allow specific methods
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Allow specific headers
  };

  try {
    const googleCredentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;

    if (!googleCredentialsBase64) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_SECRET is not set');
    }

    // Decode the base64 string and write it to a temporary file
    const googleCredentialsJson = Buffer.from(googleCredentialsBase64, 'base64').toString('utf-8');
    const keyFilePath = path.join(process.cwd(), 'google-service-account.json');
    fs.writeFileSync(keyFilePath, googleCredentialsJson);

    console.log("GOOGLE_APPLICATION_CREDENTIALS decoded and saved to", keyFilePath);

    // Authenticate with Google Sheets API using Service Account
    const auth = new google.auth.GoogleAuth({
      keyFile: keyFilePath,
      scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    });

    const client = await auth.getClient();
    console.log("Authenticated with Google Sheets API");

    const sheets = google.sheets({ version: 'v4', auth: client });

    // Attempt to fetch data from the specified Google Sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Clausulas-locacion-vivienda', // Change range if necessary
    });

    console.log("Fetched Google Sheets data:", response.data);

    // Return the response with the appropriate CORS headers
    return NextResponse.json(response.data, { headers });
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error);

    // Return a generic error with the CORS headers
    return NextResponse.error({ status: 500, headers });
  }
}
