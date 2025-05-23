import { NextResponse } from "next/server";
import Airtable from "airtable";
import * as fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "app",
  "Templates",
  "1.00 - Contrato de Locación de Vivienda - Template.docx"
);

export async function POST(request) {
  console.log("Starting API request to Airtable for contract data");

  // Initialize headers
  const headers = {
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const requestBody = await request.json();
    console.log("Request Body:", requestBody);
    const { recordId } = requestBody;

    if (!recordId) {
      console.error("Error: recordId is missing in the request body");
      return NextResponse.json(
        { error: "recordId is required in the request body" },
        { status: 400, headers }
      );
    }

    // Retrieve Airtable credentials and IDs for contract data
    const airtablePersonalAccessTokenContracts =
      process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN_ARG_DATABASE;
    const airtableBaseIdContracts =
      process.env.AIRTABLE_BASE_ID_CONTRACT_DATABASE;
    const airtableTableIdContracts = process.env.AIRTABLE_CONTRACTS_TABLE_ID;

    console.log(
      "Airtable Token (Contract Data):",
      airtablePersonalAccessTokenContracts
    );
    console.log("Airtable Base ID (Contract Data):", airtableBaseIdContracts);
    console.log("Airtable Table ID (Contract Data):", airtableTableIdContracts);

    if (!airtablePersonalAccessTokenContracts) {
      throw new Error("AIRTABLE_PERSONAL_ACCESS_TOKEN_ARG_DATABASE is not set");
    }
    if (!airtableBaseIdContracts) {
      throw new Error("AIRTABLE_BASE_ID_CONTRACT_DATABASE is not set");
    }
    if (!airtableTableIdContracts) {
      throw new Error("AIRTABLE_CONTRACTS_TABLE_ID is not set");
    }

    const baseContracts = new Airtable({
      apiKey: airtablePersonalAccessTokenContracts,
    }).base(airtableBaseIdContracts);

    // Fetch contract data from Airtable using the Table ID
    let record;
    try {
      record = await baseContracts(airtableTableIdContracts).find(recordId);
    } catch (error) {
      console.error("Error fetching record from Airtable:", error);
      return NextResponse.json(
        {
          error: `Error fetching record with ID ${recordId} from Airtable: ${error.message}`,
        },
        { status: 500, headers }
      );
    }

    if (!record || !record.fields) {
      console.error(
        `Error fetching record ${recordId} from Airtable: Record not found or fields are empty`
      );
      return NextResponse.json(
        { error: `Record with ID ${recordId} not found in Airtable` },
        { status: 404, headers }
      );
    }

    const contractData = record.fields;
    console.log("Contract data fetched from Airtable:", contractData);

    // Fetch clauses from the separate API endpoint
    async function fetchClauses() {
      const clausesEndpoint =
        "https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-get-clauses";
      console.log("Attempting to fetch clauses from:", clausesEndpoint);
      try {
        const clausesResponse = await fetch(clausesEndpoint);
        if (!clausesResponse.ok) {
          console.error(
            "Error fetching clauses from /api/1.00-locacion-get-clauses:",
            clausesResponse.status,
            clausesResponse.statusText
          );
          return { values: [] };
        }
        const clausesData = await clausesResponse.json();
        return clausesData;
      } catch (error) {
        console.error(
          "Error fetching clauses from /api/1.00-locacion-get-clauses:",
          error
        );
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
    console.log("Fetched clauses:", clauses);

    try {
      console.log("Attempting to read the template file:", TEMPLATE_PATH);
      const templateBuffer = await fs.readFile(TEMPLATE_PATH);
      console.log("Template file read successfully.");
      const { value: templateHTML } = await mammoth.convertToHtml({
        buffer: templateBuffer,
      });
      console.log("DOCX template converted to HTML.");
      let processedHTML = templateHTML;

      console.log(
        "Initial HTML content (before replacements):",
        processedHTML.substring(0, 200) + "..."
      );

      // --- Replace placeholders with matching clauses ---
      let clausesReplaced = 0;
      const allTemplatePlaceholdersInitial =
        processedHTML.match(/{{[^{}]+}}/g) || [];
      for (const templatePlaceholder of allTemplatePlaceholdersInitial) {
        const placeholderWithoutBraces = templatePlaceholder.slice(2, -2);
        const contractValue = contractData[placeholderWithoutBraces];
        if (contractValue) {
          for (const clause of clauses) {
            const clausePlaceholderWithoutBraces = clause.placeholder.slice(
              2,
              -2
            );
            if (
              clausePlaceholderWithoutBraces === placeholderWithoutBraces &&
              clause.value === contractValue
            ) {
              const regex = new RegExp(
                templatePlaceholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
                "g"
              );
              const originalLength = processedHTML.length;
              processedHTML = processedHTML.replace(
                regex,
                clause.clauseText || ""
              );
              if (processedHTML.length > originalLength) {
                clausesReplaced++;
                break;
              }
            }
          }
        }
      }
      console.log("Clauses introduced (initial):", clausesReplaced);
      console.log(
        "HTML content after introducing initial clauses:",
        processedHTML.substring(0, 200) + "..."
      );

      // --- Iteratively replace all remaining placeholders with contract data or nested clauses ---
      console.log(
        "Entering iterative placeholder replacement (with contract data or nested clauses)."
      );
      let placeholdersReplaced = 0;
      let previousHTML = "";
      let iteration = 0;
      let previousPlaceholdersReplaced = 0;
      while (processedHTML !== previousHTML && iteration < 10) {
        iteration++;
        console.log(`Iteration ${iteration} of placeholder replacement.`);
        previousHTML = processedHTML;
        const allPlaceholders = processedHTML.match(/{{[^{}]+}}/g) || [];
        for (const placeholder of allPlaceholders) {
          const placeholderWithoutBraces = placeholder.slice(2, -2);
          const contractValue = contractData[placeholderWithoutBraces];

          if (contractValue) {
            let replacedNested = false;
            for (const clause of clauses) {
              const clausePlaceholderWithoutBraces = clause.placeholder.slice(
                2,
                -2
              );
              if (
                clausePlaceholderWithoutBraces === placeholderWithoutBraces &&
                clause.value === contractValue
              ) {
                const regex = new RegExp(
                  placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
                  "g"
                );
                const originalLength = processedHTML.length;
                processedHTML = processedHTML.replace(
                  regex,
                  clause.clauseText || ""
                );
                if (processedHTML.length > originalLength) {
                  placeholdersReplaced++;
                  replacedNested = true;
                  console.log(
                    `Replaced nested placeholder '${placeholder}' with clause: '${clause.clauseText}'`
                  );
                  break; // Stop searching for this placeholder once replaced with a clause
                }
              }
            }
            // If not replaced by a full clause, try to replace directly with contract data
            if (!replacedNested && contractData[placeholderWithoutBraces]) {
              const regex = new RegExp(
                placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
                "g"
              );
              const originalLength = processedHTML.length;
              processedHTML = processedHTML.replace(
                regex,
                contractData[placeholderWithoutBraces] || ""
              );
              if (processedHTML.length > originalLength) {
                placeholdersReplaced++;
                console.log(
                  `Replaced placeholder '${placeholder}' with contract data: '${contractData[placeholderWithoutBraces]}'`
                );
              }
            }
          }
        }
        console.log(
          `End of iteration ${iteration}. Replacements in this iteration: ${
            placeholdersReplaced - previousPlaceholdersReplaced
          }`
        );
        previousPlaceholdersReplaced = placeholdersReplaced;
      }
      console.log(
        "Exiting iterative placeholder replacement. Total replacements:",
        placeholdersReplaced
      );
      console.log(
        "Final processed HTML content:",
        processedHTML.substring(0, 200) + "..."
      );

      return NextResponse.json({ processedHTML }, { status: 200, headers });
    } catch (error) {
      console.error("Error reading or processing the template:", error);
      return NextResponse.json(
        { error: `Error reading or processing the template: ${error.message}` },
        { status: 500, headers }
      );
    }
  } catch (error) {
    console.error("Error processing the request:", error);
    return NextResponse.json(
      { error: error.message || "Ocurred an error processing the request." },
      { status: 500, headers }
    );
  }
}
