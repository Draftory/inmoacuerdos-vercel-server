import { google } from "googleapis";
import { NextResponse } from "next/server";
import fetch from "node-fetch"; // Or your preferred HTTP library
import { logger } from '../../utils/logger';
import { interactWithWebflow } from '../../utils/apiUtils';

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
  const origin = req.headers.get("origin");
  const responseHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  let contractID;
  try {
    const formObject = await req.json();
    contractID = formObject.contractID;
    const { status, ...formData } = formObject;

    if (!formObject || typeof formObject !== "object" || Object.keys(formObject).length === 0) {
      logger.error('Datos inválidos', contractID);
      throw new Error("Invalid or missing data in the request body.");
    }

    const editLink = `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`;

    const googleCredentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;
    if (!googleCredentialsBase64) {
      logger.error('Credenciales faltantes', contractID);
      throw new Error("GOOGLE_APPLICATION_CREDENTIALS_SECRET is not set");
    }

    const googleCredentialsJson = Buffer.from(googleCredentialsBase64, "base64").toString("utf-8");
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

    const editLinkColumnIndex = headerRow.indexOf("Editlink");
    const valuesToWrite = [...orderedValues];
    if (editLinkColumnIndex !== -1) {
      valuesToWrite[editLinkColumnIndex] = editLink;
    } else {
      logger.warn('Columna Editlink no encontrada', contractID);
      valuesToWrite.push(editLink);
    }
    const lastColumnLetter = getColumnLetter(valuesToWrite.length);

    let rowIndex = -1;
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`,
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
          logger.info('Fila actualizada', contractID);
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
        logger.info('Nueva fila agregada', contractID);
        rowIndex = allRows.length + 1;
      }
    } else {
      logger.error('Columnas requeridas no encontradas', contractID);
      return new NextResponse(
        JSON.stringify({ error: "Could not update/append row." }),
        { status: 500, headers: responseHeaders }
      );
    }

    const webflowApiToken = process.env.WEBFLOW_API_TOKEN;
    if (webflowApiToken && process.env.WEBFLOW_USER_COLLECTION_ID) {
      const webflowUpdateResult = await interactWithWebflow(
        contractID,
        webflowApiToken,
        process.env.WEBFLOW_USER_COLLECTION_ID,
        headerRow,
        valuesToWrite,
        formData.pdffile || null,
        formData.docfile || null,
        valuesToWrite,
        sheets,
        spreadsheetId,
        sheetName,
        rowIndex,
        headerRow.indexOf("Editlink")
      );

      if (webflowUpdateResult.success) {
        logger.info('Webflow actualizado exitosamente', contractID);
      } else {
        logger.error(`Error actualizando Webflow: ${webflowUpdateResult.error}`, contractID);
        if (webflowUpdateResult.details) {
          logger.error(`Detalles del error: ${JSON.stringify(webflowUpdateResult.details)}`, contractID);
        }
      }
    } else {
      logger.warn('Config Webflow faltante', contractID);
    }

    logger.info('Proceso completado', contractID);
    return new NextResponse(
      JSON.stringify({ message: "Contract data processed successfully." }),
      { status: 200, headers: responseHeaders }
    );
  } catch (error) {
    logger.error(`Error: ${error.message}`, contractID);
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
