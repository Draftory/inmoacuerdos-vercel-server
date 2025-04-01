import { NextResponse } from 'next/server';
import Airtable from 'airtable';

// List of allowed origins
const allowedOrigins = [
  'https://www.inmoacuerdos.com',
  'https://inmoacuerdos.webflow.io'
];

export async function GET(req) {
  console.log("Starting API request to Airtable");

  // Initialize headers with a default value
  let headers = {
    'Access-Control-Allow-Origin': allowedOrigins[0], // Default to the first allowed origin
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    // Retrieve the request origin
    const origin = req.headers.get('origin');

    // Define CORS headers dynamically based on the request origin
    headers = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Retrieve Airtable credentials
    const airtablePersonalAccessToken = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID_CLAUSES;
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'Clausulas-locacion-vivienda';

    if (!airtablePersonalAccessToken) {
      throw new Error('AIRTABLE_PERSONAL_ACCESS_TOKEN is not set');
    }
    if (!airtableBaseId) {
      throw new Error('AIRTABLE_BASE_ID_CLAUSES is not set');
    }

    const base = new Airtable({ apiKey: airtablePersonalAccessToken }).base(airtableBaseId);
    console.log("Airtable client initialized");

    return new Promise((resolve, reject) => {
      const records = [];
      base(airtableTableName)
        .select({
          // Add your select options here if needed
        })
        .eachPage(
          function page(partialRecords, fetchNextPage) {
            console.log('Retrieved a page of records', partialRecords);
            records.push(...partialRecords);
            fetchNextPage();
          },
          function done(err) {
            if (err) {
              console.error('Error fetching records from Airtable:', err);
              resolve(NextResponse.error({ status: 500, headers }));
              return;
            }
            console.log('Successfully fetched all records from Airtable');
            const values = records.map(record => Object.values(record.fields));
            const airtableResponse = { values };
            console.log("Formatted Airtable data:", airtableResponse);
            resolve(NextResponse.json(airtableResponse, { headers }));
          }
        );
    });

  } catch (error) {
    console.error("Error processing Airtable request:", error);
    return NextResponse.error({ status: 500, headers });
  }
}