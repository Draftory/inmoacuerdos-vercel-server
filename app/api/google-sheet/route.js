import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import path from 'path';

export async function GET() {
  console.log("Starting API request to Google Sheets");

  try {
    // Log environment variables to ensure they are set
    console.log("GOOGLE_APPLICATION_CREDENTIALS:", process.env.GOOGLE_APPLICATION_CREDENTIALS);
    console.log("SHEET_ID:", process.env.SHEET_ID);

    // Ensure the keyFile path is correct
    const keyFilePath = path.join(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
    console.log("Key file path:", keyFilePath);

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

    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error);
    return NextResponse.error(); // Send a generic error response to the client
  }
}
