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

    // Retrieve the Airtable Personal Access Token and base ID from environment variables
    const airtablePersonalAccessToken = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID_CLAUSES; // Using the environment variable you set
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'Clausulas-locacion-vivienda'; // Default table name

    if (!airtablePersonalAccessToken) {
      throw new Error('AIRTABLE_PERSONAL_ACCESS_TOKEN is not set');
    }

    if (!airtableBaseId) {
      throw new Error('AIRTABLE_BASE_ID_CLAUSES is not set');
    }

    console.log("Airtable Personal Access Token and base ID retrieved from environment variables");

    // Initialize Airtable client with Personal Access Token
    const base = new Airtable({ apiKey: airtablePersonalAccessToken }).base(airtableBaseId);

    console.log("Airtable client initialized");

    // Array to store retrieved records
    const records = [];

    // Fetch data from the specified Airtable table
    await base(airtableTableName)
      .select({
        // You can add filters, sorting, and other options here if needed
        // Example:
        // filterByFormula: "{Status} = 'Approved'",
        // sort: [{field: 'Created At', direction: 'desc'}]
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
            // Return an error response with the CORS headers
            return NextResponse.error({ status: 500, headers });
          }
          console.log('Successfully fetched all records from Airtable');

          // Format the Airtable records into a structure similar to Google Sheets values
          const values = records.map(record => Object.values(record.fields));

          const airtableResponse = {
            values: values, // Array of rows, where each row is an array of cell values
            // You might want to include other metadata if needed
          };

          console.log("Formatted Airtable data:", airtableResponse);

          // Return the Airtable data with the appropriate CORS headers
          return NextResponse.json(airtableResponse, { headers });
        }
      );

    // Note: The NextResponse will be sent within the `done` callback of `eachPage`
    // to ensure all records are fetched.

  } catch (error) {
    console.error("Error processing Airtable request:", error);

    // Return a generic error response with the CORS headers
    return NextResponse.error({ status: 500, headers });
  }
}