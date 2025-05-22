import { google } from "googleapis";
import { NextResponse } from "next/server";
import fetch from "node-fetch"; // Or your preferred HTTP library

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

export async function OPTIONS(req) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return new NextResponse(null, {
    status: 204,
    headers: headers,
  });
}

export async function POST(req) {
  console.log("Starting API request to handle contract data");
  const origin = req.headers.get("origin");
  const responseHeaders = {
    // Create headers object for the response
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const formObject = await req.json();
    console.log("Received formObject (Server-Side):", formObject);
    const { contractID, status, ...formData } = formObject;
    console.log("Extracted formData:", formData);

    if (
      !formObject ||
      typeof formObject !== "object" ||
      Object.keys(formObject).length === 0
    ) {
      throw new Error("Invalid or missing data in the request body.");
    }

    // --- 1. Generate Edit Link ---
    const editLink = `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`;

    const googleCredentialsBase64 =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;

    if (!googleCredentialsBase64) {
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS_SECRET is not set");
    }

    const googleCredentialsJson = Buffer.from(
      googleCredentialsBase64,
      "base64"
    ).toString("utf-8");
    const credentials = JSON.parse(googleCredentialsJson);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: "https://www.googleapis.com/auth/spreadsheets",
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;

    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    const headerRow = headerResponse.data?.values?.[0] || [];
    const headerSet = new Set(headerRow);
    const orderedValues = headerRow.map((header) => formObject[header] || "");

    // Find the index of the 'Editlink' column
    const editLinkColumnIndex = headerRow.indexOf("Editlink");
    const valuesToWrite = [...orderedValues];
    if (editLinkColumnIndex !== -1) {
      valuesToWrite[editLinkColumnIndex] = editLink;
    } else {
      console.warn("Warning: 'Editlink' column not found in the sheet header.");
      valuesToWrite.push(editLink); // Append to the end
    }
    const lastColumnLetter = getColumnLetter(valuesToWrite.length);

    // --- Save to Google Sheets (including editLink) ---
    let rowIndex = -1;
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Adjust range as needed
    });
    const allRows = allRowsResponse.data?.values || [];
    const contractIDColumnIndex = headerRow.indexOf("contractID");
    const memberstackIDColumnIndex = headerRow.indexOf("MemberstackID");

    if (contractIDColumnIndex !== -1 && memberstackIDColumnIndex !== -1) {
      for (let i = 1; i < allRows.length; i++) {
        if (
          allRows[i][contractIDColumnIndex] === formObject.contractID &&
          allRows[i][memberstackIDColumnIndex] === formObject.MemberstackID
        ) {
          rowIndex = i + 1;
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A${rowIndex}:${lastColumnLetter}${rowIndex}`,
            valueInputOption: "RAW",
            requestBody: { values: [valuesToWrite] },
          });
          console.log("Row updated successfully (including editLink)");
          break;
        }
      }
      if (rowIndex === -1) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A:${lastColumnLetter}`,
          valueInputOption: "RAW",
          requestBody: { values: [valuesToWrite] },
        });
        console.log("New row added successfully (including editLink)");
        rowIndex = allRows.length + 1; // Approximate new row index
      }
    } else {
      console.error(
        "contractID or MemberstackID column not found, cannot update/append."
      );
      return new NextResponse(
        JSON.stringify({ error: "Could not update/append row." }),
        { status: 500, headers: responseHeaders }
      );
    }

    // --- Interact with Webflow API ---
    const webflowApiToken = process.env.WEBFLOW_API_TOKEN; // Using the correct environment variable
    if (webflowApiToken) {
      const webflowCollectionId = process.env.WEBFLOW_USER_COLLECTION_ID; // Using the correct environment variable
      const itemNameFieldSlug = "name";

      const fetchUrl = new URL(
        `https://api.webflow.com/v2/collections/${webflowCollectionId}/items`
      );
      fetchUrl.searchParams.set(itemNameFieldSlug, contractID);

      const listItemsResponse = await fetch(fetchUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${webflowApiToken}`,
          "accept-version": "2.0.0",
        },
      });
      const listItemsData = await listItemsResponse.json();
      const existingItem = listItemsData.items?.[0];

      const fieldData = mapFormDataToWebflowFields(formData);
      fieldData.editlink = editLink; // Ensure 'editlink' is set
      fieldData.name = contractID; // Ensure 'name' is set correctly
      fieldData.slug = contractID; // Ensure 'slug' is set correctly

      let webflowResponse;
      let requestBody;
      const updateUrl = existingItem
        ? `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/${existingItem.id}/live`
        : `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/live`;

      const method = existingItem ? "PATCH" : "POST";

      if (method === "POST") {
        requestBody = {
          fieldData: fieldData,
        };
      } else {
        requestBody = {
          fieldData: fieldData,
          isArchived: false,
          isDraft: false,
        };
      }

      console.log(
        `Webflow ${method} Request Body:`,
        JSON.stringify(requestBody)
      );

      webflowResponse = await fetch(updateUrl, {
        method: method,
        headers: {
          Authorization: `Bearer ${webflowApiToken}`,
          "accept-version": "2.0.0",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const webflowResult = await webflowResponse.json();
      console.log("Webflow API Response:", webflowResult);

      if (!webflowResponse.ok) {
        console.error("Error interacting with Webflow API:", webflowResult);
        // Consider how to handle Webflow API errors
      }
    } else {
      console.warn("WEBFLOW_API_TOKEN not configured.");
    }

    return new NextResponse(
      JSON.stringify({ message: "Contract data processed successfully." }),
      { status: 200, headers: responseHeaders }
    );
  } catch (error) {
    console.error("Error in Vercel POST:", error);
    return new NextResponse(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: responseHeaders,
    });
  }
}

function mapFormDataToWebflowFields(formData) {
  return {
    editlink: "", // Will be set in the main POST function
    denominacionlegallocadorpj1:
      formData["denominacionLegalLocadorPJ1"] || null,
    nombrelocatariopf1: formData["nombreLocatarioPF1"] || null,
    timestamp: formData["timestamp"] || null,
    status: formData["status"] || null, // Map 'status'
    contrato: formData["Contrato"] || null,
    memberstackid: formData["MemberstackID"] || null,
    name: formData["contractID"] || "", // Directly use formData['contractID']
    slug: formData["contractID"] || "", // Directly use formData['contractID']
    domicilioinmueblelocado: formData["domicilioInmuebleLocado"] || null,
    ciudadinmueblelocado: formData["ciudadInmuebleLocado"] || null,
    nombrelocadorpf1: formData["nombreLocadorPF1"] || null,
    denominacionlegallocatariopj1:
      formData["denominacionLegalLocatarioPJ1"] || null,
    hiddeninputlocacionfechainicio:
      formData["hiddenInputLocacionFechaInicio"] || null,
    hiddeninputlocacionfechatermino:
      formData["hiddenInputLocacionFechaTermino"] || null,
    pdffile: formData["pdffile"] || null, // Map 'pdffile'
    docfile: formData["docfile"] || null, // Map 'docfile'
  };
}

function getColumnLetter(columnNumber) {
  let columnLetter = "";
  let temp = columnNumber;
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    columnLetter = String.fromCharCode(65 + remainder) + columnLetter;
    temp = Math.floor((temp - 1) / 26);
  }
  return columnLetter;
}
