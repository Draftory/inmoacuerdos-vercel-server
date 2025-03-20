import { google } from 'googleapis';
import { NextResponse } from 'next/server';

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
        const formObject = await req.json();
        console.log("Received formObject (Server-Side):", formObject);

        if (!formObject || typeof formObject !== 'object' || Object.keys(formObject).length === 0) {
            throw new Error('Invalid or missing data in the request body.');
        }

        const googleCredentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;

        if (!googleCredentialsBase64) {
            throw new Error('GOOGLE_APPLICATION_CREDENTIALS_SECRET is not set');
        }

        const googleCredentialsJson = Buffer.from(googleCredentialsBase64, 'base64').toString('utf-8');
        const credentials = JSON.parse(googleCredentialsJson);

        console.log("GOOGLE_APPLICATION_CREDENTIALS_SECRET decoded and ready for use");

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: 'https://www.googleapis.com/auth/spreadsheets',
        });

        const client = await auth.getClient();
        console.log("Authenticated with Google Sheets API");

        const sheets = google.sheets({ version: 'v4', auth: client });

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
            throw new Error('Header row not found in the spreadsheet.');
        }

        const headerSet = new Set(headerRow);
        const notFoundInSheet = [];

        for (const key in formObject) {
            if (!headerSet.has(key)) {
                notFoundInSheet.push(key);
            }
        }

        if (notFoundInSheet.length > 0) {
            console.warn("The following input names were not found in the Google Sheet header:", notFoundInSheet);
        }

        const orderedValues = headerRow.map(header => formObject[header] || "");
        console.log("Ordered Values:", orderedValues);

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetName}!A:Z`,
            valueInputOption: "RAW",
            requestBody: {
                values: [orderedValues],
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