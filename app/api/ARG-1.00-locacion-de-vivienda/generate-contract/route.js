import { NextResponse } from "next/server";
import Airtable from "airtable";
import mammoth from "mammoth";
import fs from "fs/promises";
import { logger } from '../../../utils/logger';

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

const TEMPLATE_PATH = "./app/templates/1.00-locacion-de-vivienda.docx";

export async function POST(request) {
  const origin = request.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const { recordId } = await request.json();
    if (!recordId) {
      logger.error('ID de registro faltante');
      return NextResponse.json(
        { error: "Record ID is required" },
        { status: 400, headers }
      );
    }

    const airtablePersonalAccessTokenContracts =
      process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
    const airtableBaseIdContracts = process.env.AIRTABLE_BASE_ID_CONTRACTS;
    const airtableTableIdContracts = process.env.AIRTABLE_TABLE_ID_CONTRACTS;

    if (!airtablePersonalAccessTokenContracts || !airtableBaseIdContracts || !airtableTableIdContracts) {
      logger.error('Config Airtable faltante');
      return NextResponse.json(
        { error: "Airtable configuration is missing" },
        { status: 500, headers }
      );
    }

    const baseContracts = new Airtable({
      apiKey: airtablePersonalAccessTokenContracts,
    }).base(airtableBaseIdContracts);

    let record;
    try {
      record = await baseContracts(airtableTableIdContracts).find(recordId);
    } catch (error) {
      logger.error(`Error Airtable: ${error.message}`);
      return NextResponse.json(
        { error: `Error fetching record: ${error.message}` },
        { status: 500, headers }
      );
    }

    if (!record || !record.fields) {
      logger.error('Registro no encontrado');
      return NextResponse.json(
        { error: "Record not found" },
        { status: 404, headers }
      );
    }

    const contractData = record.fields;

    async function fetchClauses() {
      const clausesEndpoint = "https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-get-clauses";
      try {
        const clausesResponse = await fetch(clausesEndpoint);
        if (!clausesResponse.ok) {
          logger.error('Error al obtener cláusulas');
          return { values: [] };
        }
        const clausesData = await clausesResponse.json();
        return clausesData;
      } catch (error) {
        logger.error(`Error cláusulas: ${error.message}`);
        return { values: [] };
      }
    }

    const clausesResponse = await fetchClauses();
    const clauses = clausesResponse.values
      ? clausesResponse.values.map((row) => ({
          placeholder: `{{${row[0]}}}`,
          value: row[1],
          clauseText: row[2],
        }))
      : [];

    try {
      const templateBuffer = await fs.readFile(TEMPLATE_PATH);
      const { value: templateHTML } = await mammoth.convertToHtml({
        buffer: templateBuffer,
      });
      let processedHTML = templateHTML;

      let iteration = 0;
      let previousHTML = "";
      let placeholdersReplaced = 0;
      let previousPlaceholdersReplaced = 0;

      while (processedHTML !== previousHTML && iteration < 10) {
        iteration++;
        previousHTML = processedHTML;

        for (const clause of clauses) {
          const regex = new RegExp(clause.placeholder, "g");
          const originalLength = processedHTML.length;
          processedHTML = processedHTML.replace(regex, clause.clauseText);
          if (processedHTML.length !== originalLength) {
            placeholdersReplaced++;
          }
        }

        const allTemplatePlaceholders = processedHTML.match(/{{[^{}]+}}/g) || [];
        for (const placeholder of allTemplatePlaceholders) {
          const placeholderWithoutBraces = placeholder.slice(2, -2);
          let replacedNested = false;

          for (const clause of clauses) {
            if (clause.placeholder === placeholder) {
              const regex = new RegExp(placeholder, "g");
              const originalLength = processedHTML.length;
              processedHTML = processedHTML.replace(regex, clause.clauseText);
              if (processedHTML.length !== originalLength) {
                placeholdersReplaced++;
                replacedNested = true;
              }
              break;
            }
          }

          if (!replacedNested && contractData[placeholderWithoutBraces]) {
            const regex = new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "g");
            const originalLength = processedHTML.length;
            processedHTML = processedHTML.replace(regex, contractData[placeholderWithoutBraces] || "");
            if (processedHTML.length !== originalLength) {
              placeholdersReplaced++;
            }
          }
        }
      }

      logger.info('Contrato generado', recordId);
      return NextResponse.json({ processedHTML }, { status: 200, headers });
    } catch (error) {
      logger.error(`Error plantilla: ${error.message}`, recordId);
      return NextResponse.json(
        { error: `Error processing template: ${error.message}` },
        { status: 500, headers }
      );
    }
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    return NextResponse.json(
      { error: error.message || "Error processing request" },
      { status: 500, headers }
    );
  }
}
