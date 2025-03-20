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
    console.log("Starting API request to Google Sheets for draft data");
    const origin = req.headers.get('origin');
    const headers = {
        'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    try {
        const requestBody = await req.json();
        const contractID = requestBody.contractID;

        if (!contractID) {
            return new NextResponse(JSON.stringify({ error: 'contractID is required' }), {
                status: 400,
                headers: headers,
            });
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
            scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        });
        const client = await auth.getClient();
        const sheets = google.sheets({ version: 'v4', auth: client });

        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: process.env.LOCACION_POST_DATABASE_SHEET_ID,
            range: process.env.LOCACION_POST_DATABASE_SHEET_NAME,
        });

        const values = response.data.values;
        if (!values || values.length <= 1) {
            return new NextResponse(JSON.stringify({ error: 'No data found in the spreadsheet' }), {
                status: 404,
                headers: headers,
            });
        }

        const headersRow = values[0];
        const contractIDIndex = headersRow.indexOf('contractID');

        if (contractIDIndex === -1) {
            return new NextResponse(JSON.stringify({ error: 'contractID column not found' }), {
                status: 400,
                headers: headers,
            });
        }

        for (let i = 1; i < values.length; i++) {
            if (values[i][contractIDIndex] === contractID) {
                const draftData = {};
                for (let j = 0; j < headersRow.length; j++) {
                    draftData[headersRow[j]] = values[i][j];
                }
                return NextResponse.json(draftData, { headers });
            }
        }

        return new NextResponse(JSON.stringify({ error: 'Draft not found' }), {
            status: 404,
            headers: headers,
        });
    } catch (error) {
        console.error("POST Error:", error);
        return NextResponse.error({ status: 500, headers });
    }
}