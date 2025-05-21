import { google } from "googleapis";
import { NextResponse } from "next/server";
import { webflowUtility } from "https://inmoacuerdos-vercel-server.vercel.app/api/Utilities/webflowGetUpdateCreate"; // Adjust path as needed

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
  console.log("Starting API request to Google Sheets & Webflow (Draft)");
  const origin = req.headers.get("origin");
  const responseHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const formObject = await req.json();
    console.log("Received formObject (Server-Side - Draft):", formObject);
    const { contractID, ...formData } = formObject;

    if (
      !formObject ||
      typeof formObject !== "object" ||
      Object.keys(formObject).length === 0
    ) {
      throw new Error("Invalid or missing data in the request body.");
    }

    // --- 1. Generate Edit Link ---
    const editLink = `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`;

    // --- 2. Update Google Sheets ---
    const googleCredentials = JSON.parse(
      Buffer.from(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET,
        "base64"
      ).toString("utf-8")
    );
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
    const orderedValues = headerRow.map((header) => formObject[header] || "");
    const lastColumnLetter = getColumnLetter(orderedValues.length);
    const contractIDColumnIndexGS = headerRow.indexOf("contractID");
    const memberstackIDColumnIndexGS = headerRow.indexOf("MemberstackID");
    let rowIndexGS = -1;
    const allRowsResponseGS = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`,
    });
    const allRowsGS = allRowsResponseGS.data?.values || [];
    const editLinkColumnIndexGS = headerRow.indexOf("Editlink");
    const valuesToWriteGS = [...orderedValues];
    if (editLinkColumnIndexGS !== -1) {
      valuesToWriteGS[editLinkColumnIndexGS] = editLink;
    } else {
      console.warn("Warning: 'Editlink' column not found in the sheet header.");
      valuesToWriteGS.push(editLink);
    }

    if (contractIDColumnIndexGS !== -1 && memberstackIDColumnIndexGS !== -1) {
      for (let i = 1; i < allRowsGS.length; i++) {
        if (
          allRowsGS[i][contractIDColumnIndexGS] === contractID &&
          allRowsGS[i][memberstackIDColumnIndexGS] === formObject.MemberstackID
        ) {
          rowIndexGS = i + 1;
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A${rowIndexGS}:${lastColumnLetter}${rowIndexGS}`,
            valueInputOption: "RAW",
            requestBody: { values: [valuesToWriteGS] },
          });
          console.log("Google Sheets row updated successfully (Draft)");
          break;
        }
      }
      if (rowIndexGS === -1) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A:${lastColumnLetter}`,
          valueInputOption: "RAW",
          requestBody: { values: [valuesToWriteGS] },
        });
        console.log("Google Sheets new row added successfully (Draft)");
      }
    } else {
      console.error(
        "contractID or MemberstackID column not found in Google Sheets, cannot update/append (Draft)."
      );
      return new NextResponse(
        JSON.stringify({
          error: "Could not update/append row in Google Sheets (Draft).",
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    // --- 3. Interact with Webflow API using utility ---
    const webflowFieldData = mapFormDataToWebflowFields(formData);
    webflowFieldData.editlink = editLink;
    webflowFieldData.name = contractID;
    webflowFieldData.slug = contractID;

    const webflowResult = await webflowUtility(contractID, webflowFieldData);

    if (webflowResult.success) {
      console.log(
        "Webflow interaction successful (Draft):",
        webflowResult.data
      );
      return new NextResponse(
        JSON.stringify({
          message: "Draft saved successfully.",
          webflow: webflowResult.data,
        }),
        { status: 200, headers: responseHeaders }
      );
    } else {
      console.error(
        "Webflow interaction failed (Draft):",
        webflowResult.error,
        webflowResult.details
      );
      return new NextResponse(
        JSON.stringify({
          message: "Draft saved successfully, but Webflow interaction failed.",
          webflowError: webflowResult.error,
          webflowDetails: webflowResult.details,
        }),
        { status: 500, headers: responseHeaders }
      );
    }
  } catch (error) {
    console.error("POST Error (Draft):", error);
    return new NextResponse(
      JSON.stringify({ error: error.message, stack: error.stack }),
      { status: 500, headers: responseHeaders }
    );
  }
}

function mapFormDataToWebflowFields(formData) {
  return {
    editlink: "",
    denominacionlegallocadorpj1:
      formData["denominacionLegalLocadorPJ1"] || null,
    nombrelocatariopf1: formData["nombreLocatarioPF1"] || null,
    timestamp: formData["timestamp"] || null,
    status: formData["status"] || null,
    contrato: formData["Contrato"] || null,
    memberstackid: formData["MemberstackID"] || null,
    name: formData["contractID"] || "",
    slug: formData["contractID"] || "",
    domicilioinmueblelocado: formData["domicilioInmuebleLocado"] || null,
    ciudadinmueblelocado: formData["ciudadInmuebleLocado"] || null,
    nombrelocadorpf1: formData["nombreLocadorPF1"] || null,
    denominacionlegallocatariopj1:
      formData["denominacionLegalLocatarioPJ1"] || null,
    hiddeninputlocacionfechainicio:
      formData["hiddenInputLocacionFechaInicio"] || null,
    hiddeninputlocacionfechatermino:
      formData["hiddenInputLocacionFechaTermino"] || null,
    pdffile: formData["pdffile"] || null,
    docfile: formData["docfile"] || null,
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
