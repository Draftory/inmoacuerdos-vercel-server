import { NextResponse } from "next/server";
import Airtable from "airtable";
import { logger } from '../../utils/logger';

// List of allowed origins
const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

export async function GET(req) {
  let headers = {
    "Access-Control-Allow-Origin": allowedOrigins[0],
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const origin = req.headers.get("origin");
    headers = {
      "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0],
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    const airtablePersonalAccessToken = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
    const airtableBaseId = process.env.AIRTABLE_BASE_ID_CLAUSES;
    const airtableTableName = process.env.AIRTABLE_TABLE_NAME || "Clausulas-locacion-vivienda";

    if (!airtablePersonalAccessToken) {
      logger.error('Token Airtable faltante');
      throw new Error("AIRTABLE_PERSONAL_ACCESS_TOKEN is not set");
    }
    if (!airtableBaseId) {
      logger.error('Base ID Airtable faltante');
      throw new Error("AIRTABLE_BASE_ID_CLAUSES is not set");
    }

    const base = new Airtable({ apiKey: airtablePersonalAccessToken }).base(airtableBaseId);

    return new Promise((resolve, reject) => {
      const records = [];
      base(airtableTableName)
        .select()
        .eachPage(
          function page(partialRecords, fetchNextPage) {
            records.push(...partialRecords);
            fetchNextPage();
          },
          function done(err) {
            if (err) {
              logger.error(`Error Airtable: ${err.message}`);
              resolve(NextResponse.error({ status: 500, headers }));
              return;
            }
            const values = records.map((record) => Object.values(record.fields));
            const airtableResponse = { values };
            resolve(NextResponse.json(airtableResponse, { headers }));
          }
        );
    });
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    return NextResponse.error({ status: 500, headers });
  }
}
