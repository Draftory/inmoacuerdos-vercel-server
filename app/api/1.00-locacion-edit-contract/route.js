import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { logger } from '../../utils/logger';

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
    const origin = req.headers.get('origin');
    const headers = {
        'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    try {
        const requestBody = await req.json();
        const contractID = requestBody.contractID;
        const memberstackID = requestBody.memberstackID;

        if (!contractID || !memberstackID) {
            logger.error('Datos requeridos faltantes', contractID);
            return new NextResponse(JSON.stringify({ error: 'contractID and memberstackID are required' }), {
                status: 400,
                headers: headers,
            });
        }

        const googleCredentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;
        if (!googleCredentialsBase64) {
            logger.error('Credenciales faltantes', contractID);
            throw new Error('GOOGLE_APPLICATION_CREDENTIALS_SECRET is not set');
        }

        const googleCredentialsJson = Buffer.from(googleCredentialsBase64, 'base64').toString('utf-8');
        const credentials = JSON.parse(googleCredentialsJson);

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
        if (!values || values.length === 0) {
            logger.error('Datos no encontrados', contractID);
            return new NextResponse(JSON.stringify({ error: 'No data found in spreadsheet' }), {
                status: 404,
                headers: headers,
            });
        }

        const headerRow = values[0];
        const contractIDIndex = headerRow.indexOf('contractID');
        const memberstackIDIndex = headerRow.indexOf('MemberstackID');

        if (contractIDIndex === -1 || memberstackIDIndex === -1) {
            logger.error('Columnas no encontradas', contractID);
            return new NextResponse(JSON.stringify({ error: 'Required columns not found' }), {
                status: 500,
                headers: headers,
            });
        }

        const row = values.find(row => 
            row[contractIDIndex] === contractID && 
            row[memberstackIDIndex] === memberstackID
        );

        if (!row) {
            logger.error('Fila no encontrada', contractID);
            return new NextResponse(JSON.stringify({ error: 'Row not found' }), {
                status: 404,
                headers: headers,
            });
        }

        const formData = {};
        headerRow.forEach((header, index) => {
            formData[header] = row[index] || '';
        });

        logger.info('Datos recuperados', contractID);
        return new NextResponse(JSON.stringify(formData), {
            status: 200,
            headers: headers,
        });
    } catch (error) {
        logger.error(`Error: ${error.message}`, contractID);
        return new NextResponse(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: headers,
        });
    }
}