import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";
import { getColumnLetter } from "./helpers";
import { logger } from './logger';

/**
 * Procesa los datos de pago de Mercado Pago y actualiza la hoja de cálculo.
 * @param {Object} sheets - Cliente de Google Sheets API
 * @param {string} spreadsheetId - ID de la hoja de cálculo
 * @param {string} sheetName - Nombre de la hoja
 * @param {Array<string>} headerRow - Fila de encabezados
 * @param {Object} paymentData - Datos del pago
 * @param {number} rowIndex - Índice de la fila a actualizar
 * @param {Array<string>} rowDataToPass - Datos originales de la fila
 * @returns {Object} Datos actualizados de la fila
 */
export async function processMercadoPagoPayment(
  sheets,
  spreadsheetId,
  sheetName,
  headerRow,
  paymentData,
  rowIndex,
  rowDataToPass
) {
  const {
    contractID,
    memberstackID,
    emailMember,
    emailGuest,
    payment_id,
    estadoDePago,
    fechaDePago,
    tipoDePago: tipoDePagoRecibido,
  } = paymentData;

  // Obtener índices de columnas
  const contractIDColumnIndex = headerRow.indexOf("contractID");
  const tipoDePagoColumnIndex = headerRow.indexOf("tipoDePago");
  const estadoDePagoColumnIndex = headerRow.indexOf("estadoDePago");
  const paymentIdColumnIndex = headerRow.indexOf("payment_id");
  const fechaDePagoColumnIndex = headerRow.indexOf("fechaDePago");
  const statusColumnIndex = headerRow.indexOf("status");

  // Validar columnas esenciales
  if (contractIDColumnIndex === -1) {
    throw new Error("contractID column not found in Google Sheet.");
  }
  if (tipoDePagoColumnIndex === -1) {
    throw new Error("tipoDePago column not found in Google Sheet.");
  }
  if (estadoDePagoColumnIndex === -1) {
    throw new Error("estadoDePago column not found in Google Sheet.");
  }
  if (paymentIdColumnIndex === -1) {
    throw new Error("payment_id column not found in Google Sheet.");
  }
  if (fechaDePagoColumnIndex === -1) {
    throw new Error("fechaDePago column not found in Google Sheet.");
  }
  if (statusColumnIndex === -1) {
    throw new Error("status column not found in Google Sheet.");
  }

  // Preparar datos de pago
  const paymentIdToUse = payment_id || uuidv4();
  const nowArgentina = new Date().toLocaleString("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
  const fechaDePagoToUse = fechaDePago
    ? new Date(fechaDePago).toISOString()
    : nowArgentina;
  const estadoDePagoToUse =
    estadoDePago === "approved" ? "Pagado" : estadoDePago;
  const tipoDePagoToUse = tipoDePagoRecibido || "Mercado Pago";

  // Actualizar valores de la fila
  const updatedRowValues = [...rowDataToPass];
  updatedRowValues[tipoDePagoColumnIndex] = tipoDePagoToUse;
  updatedRowValues[estadoDePagoColumnIndex] = estadoDePagoToUse;
  updatedRowValues[paymentIdColumnIndex] = paymentIdToUse;
  updatedRowValues[fechaDePagoColumnIndex] = fechaDePagoToUse;

  // Actualizar estado si el pago está aprobado
  if (estadoDePago && estadoDePago.toLowerCase() === "approved") {
    updatedRowValues[statusColumnIndex] = "Contrato";
  }

  return {
    updatedRowValues,
    paymentIdToUse,
    fechaDePagoToUse,
    estadoDePagoToUse,
    tipoDePagoToUse,
  };
}

/**
 * Genera documentos a través de Google Apps Script.
 * @param {Object} sheets - Cliente de Google Sheets API
 * @param {string} spreadsheetId - ID de la hoja de cálculo
 * @param {string} sheetName - Nombre de la hoja
 * @param {number} rowIndex - Índice de la fila
 * @param {Array<string>} rowDataToPass - Datos originales de la fila
 * @param {Array<string>} headerRow - Fila de encabezados
 * @returns {Object} URLs de los documentos generados
 */
export async function generateDocuments(
  sheets,
  spreadsheetId,
  sheetName,
  rowIndex,
  rowDataToPass,
  headerRow
) {
  if (!process.env.APPS_SCRIPT_GENERATE_DOC_URL || !process.env.VERCEL_API_SECRET) {
    logger.warn('APPS_SCRIPT_GENERATE_DOC_URL o VERCEL_API_SECRET no configurados');
    return null;
  }

  const dataToSendToAppsScript = {
    secret: process.env.VERCEL_API_SECRET,
    spreadsheetId,
    sheetName,
    rowNumber: rowIndex,
    rowData: rowDataToPass,
    headers: headerRow,
  };

  try {
    const appsScriptResponse = await fetch(process.env.APPS_SCRIPT_GENERATE_DOC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dataToSendToAppsScript),
    });

    if (appsScriptResponse.ok) {
      const appsScriptResponseData = await appsScriptResponse.json();
      return {
        pdfUrl: appsScriptResponseData?.pdfUrl,
        docUrl: appsScriptResponseData?.docUrl,
      };
    } else {
      logger.error('Error al generar documentos', rowDataToPass[headerRow.indexOf('contractID')]);
      return null;
    }
  } catch (error) {
    logger.error(`Error al interactuar con Apps Script: ${error.message}`, rowDataToPass[headerRow.indexOf('contractID')]);
    return null;
  }
}

/**
 * Actualiza los enlaces de documentos en la hoja de cálculo.
 * @param {Object} sheets - Cliente de Google Sheets API
 * @param {string} spreadsheetId - ID de la hoja de cálculo
 * @param {string} sheetName - Nombre de la hoja
 * @param {number} rowIndex - Índice de la fila
 * @param {string} pdfUrl - URL del PDF
 * @param {string} docUrl - URL del DOC
 * @param {number} pdfFileColumnIndex - Índice de la columna PDFFile
 * @param {number} docFileColumnIndex - Índice de la columna DOCFile
 */
export async function updateDocumentLinks(
  sheets,
  spreadsheetId,
  sheetName,
  rowIndex,
  pdfUrl,
  docUrl,
  pdfFileColumnIndex,
  docFileColumnIndex
) {
  if (pdfUrl && docUrl && pdfFileColumnIndex !== -1 && docFileColumnIndex !== -1) {
    const updateLinksRange = `${sheetName}!${getColumnLetter(docFileColumnIndex + 1)}${rowIndex}:${getColumnLetter(pdfFileColumnIndex + 1)}${rowIndex}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateLinksRange,
      valueInputOption: "RAW",
      requestBody: { values: [[docUrl, pdfUrl]] },
    });
    logger.info('Enlaces de documentos actualizados', rowDataToPass[headerRow.indexOf('contractID')]);
  }
} 