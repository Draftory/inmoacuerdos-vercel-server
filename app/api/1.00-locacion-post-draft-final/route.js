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

        // Debugging logs
        console.log("Header Row Length:", headerRow.length);
        console.log("Ordered Values Length:", orderedValues.length);
        console.log("Header Row:", headerRow);
        console.log("Form Object:", formObject);

        // Add a log to display the column letter
        const lastColumnLetter = getColumnLetter(orderedValues.length);
        console.log(`Writing up to column: ${lastColumnLetter}`);

        // Retrieve all rows to search for contractID
        const allRowsResponse = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A:VM`,
        });

        const allRows = allRowsResponse.data?.values || [];

        // Find the index of the contractID and MemberstackID columns
        const contractIDColumnIndex = headerRow.indexOf('contractID');
        const memberstackIDColumnIndex = headerRow.indexOf('MemberstackID');

        if (contractIDColumnIndex === -1) {
            throw new Error('contractID column not found in the header.');
        }
        if (memberstackIDColumnIndex === -1) {
            throw new Error('MemberstackID column not found in the header.');
        }

        // Search for the row with the matching contractID and MemberstackID
        let rowIndex = -1;
        for (let i = 1; i < allRows.length; i++) { // Start from 1 to skip header
            if (allRows[i][contractIDColumnIndex] === formObject.contractID && allRows[i][memberstackIDColumnIndex] === formObject.MemberstackID) {
                rowIndex = i + 1; // +1 to account for header row and 1-based indexing
                break;
            }
        }

        if (rowIndex !== -1) {
            // Update existing row
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetName}!A${rowIndex}:${lastColumnLetter}${rowIndex}`,
                valueInputOption: "RAW",
                requestBody: {
                    values: [orderedValues],
                },
            });
            console.log("Row updated successfully");
        } else {
            // Check if a row with the contractID exists
            let contractIDExists = false;
            for (let i = 1; i < allRows.length; i++) {
                if (allRows[i][contractIDColumnIndex] === formObject.contractID) {
                    contractIDExists = true;
                    break;
                }
            }

            if (contractIDExists) {
                return new NextResponse(JSON.stringify({ error: "ContractID already exists." }), {
                    status: 409, // Conflict status code
                    headers: headers,
                });
            }

            // Append new row
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: `${sheetName}!A:${lastColumnLetter}`,
                valueInputOption: "RAW",
                requestBody: {
                    values: [orderedValues],
                },
            });
            console.log("New row added successfully");
        }

        return new NextResponse(JSON.stringify({ message: rowIndex !== -1 ? "Row updated successfully." : "New row added successfully." }), {
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

// Function to convert column number to letter
function getColumnLetter(columnNumber) {
    let columnLetter = '';
    let temp = columnNumber;
    while (temp > 0) {
        const remainder = (temp - 1) % 26;
        columnLetter = String.fromCharCode(65 + remainder) + columnLetter;
        temp = Math.floor((temp - 1) / 26);
    }
    return columnLetter;
}