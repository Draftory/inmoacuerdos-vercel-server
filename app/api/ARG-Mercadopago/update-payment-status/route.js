import { NextResponse } from "next/server";
import {
  interactWithWebflow,
  sendEmailNotification,
} from "../../../utils/apiUtils";
import { getColumnLetter } from "../../../utils/helpers";
import {
  getGoogleSheetsClient,
  getSheetHeaderRow,
  updateSheetRow,
  findRowByColumns,
} from "../../../utils/googleSheetsUtils";
import {
  processMercadoPagoPayment,
  updateDocumentLinks,
} from "../../../utils/mercadopagoUtils";
import { logger } from '../../../utils/logger';

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

// Función helper para crear respuestas consistentes
function createResponse(data, status = 200) {
  const headers = {
    'Content-Type': 'application/json',
    "Access-Control-Allow-Origin": allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return new NextResponse(
    JSON.stringify(data),
    {
      status,
      headers
    }
  );
}

export async function OPTIONS(req) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return new NextResponse(null, { status: 204, headers });
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
    logger.info('Iniciando procesamiento de pago');
    const paymentData = await req.json();
    contractID = paymentData.contractID;

    if (!contractID) {
      logger.error('contractID faltante');
      return createResponse(
        { error: "contractID es requerido en el cuerpo de la solicitud." },
        400
      );
    }

    // Inicializar cliente de Google Sheets
    const sheets = await getGoogleSheetsClient(
      process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET
    );
    const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;

    // Obtener encabezados y encontrar la fila
    const headerRow = await getSheetHeaderRow(sheets, spreadsheetId, sheetName);
    const contractIDColumnIndex = headerRow.indexOf("contractID");

    if (contractIDColumnIndex === -1) {
      logger.error('Columna contractID no encontrada', contractID);
      return createResponse(
        { error: "Columna contractID no encontrada en la hoja de cálculo." },
        500
      );
    }

    // Buscar la fila usando findRowByColumns solo por contractID
    const { rowIndex, rowData: rowDataToPass } = await findRowByColumns(
      sheets,
      spreadsheetId,
      sheetName,
      ["contractID"],
      [contractID]
    );

    if (rowIndex === -1) {
      logger.warn('No se encontró entrada coincidente', contractID);
      return createResponse(
        { error: "No se encontró entrada coincidente en la hoja de cálculo." },
        404
      );
    }

    // Procesar el pago y actualizar la hoja
    const {
      updatedRowValues,
      paymentIdToUse,
      fechaDePagoToUse,
      estadoDePagoToUse,
    } = await processMercadoPagoPayment(
      sheets,
      spreadsheetId,
      sheetName,
      headerRow,
      paymentData,
      rowIndex,
      rowDataToPass
    );

    // Actualizar la hoja con los nuevos valores
    const lastColumnLetter = getColumnLetter(updatedRowValues.length);
    await updateSheetRow(
      sheets,
      spreadsheetId,
      sheetName,
      `A${rowIndex}:${lastColumnLetter}${rowIndex}`,
      updatedRowValues
    );

    logger.info('Hoja actualizada', contractID);

    // Verificar si es un pago nuevo y está aprobado
    const existingPaymentId = rowDataToPass[headerRow.indexOf("payment_id")];
    if (estadoDePagoToUse === "Pagado" && !existingPaymentId) {
      logger.info('Solicitando generación de documentos', contractID);
      
      // Preparar datos para Apps Script
      const dataToSendToAppsScript = {
        secret: process.env.VERCEL_API_SECRET,
        contractData: Object.fromEntries(headerRow.map((header, index) => [header, updatedRowValues[index]])),
        headers: headerRow,
        values: updatedRowValues
      };

      try {
        const appsScriptResponse = await fetch(
          process.env.APPS_SCRIPT_GENERATE_DOC_URL,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dataToSendToAppsScript),
          }
        );

        if (appsScriptResponse.ok) {
          const appsScriptResponseData = await appsScriptResponse.json();
          logger.info('Documentos generados', contractID);
          const pdfUrl = appsScriptResponseData?.pdfUrl;
          const docUrl = appsScriptResponseData?.docUrl;
          logger.info(`Documentos generados para contractID: ${contractID}. PDF: ${!!pdfUrl}, DOC: ${!!docUrl}`);

          if (pdfUrl && docUrl) {
            // Actualizar enlaces de documentos en la hoja
            await updateDocumentLinks(
              sheets,
              spreadsheetId,
              sheetName,
              rowIndex,
              pdfUrl,
              docUrl,
              headerRow.indexOf("PDFFile"),
              headerRow.indexOf("DOCFile")
            );

            // Actualizar Webflow si está configurado
            if (process.env.WEBFLOW_API_TOKEN && process.env.WEBFLOW_USER_COLLECTION_ID) {
              const webflowUpdateResult = await interactWithWebflow(
                contractID,
                process.env.WEBFLOW_API_TOKEN,
                process.env.WEBFLOW_USER_COLLECTION_ID,
                headerRow,
                updatedRowValues,
                pdfUrl,
                docUrl,
                updatedRowValues,
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
            }

            // Enviar notificaciones por correo
            const emailMember = updatedRowValues[headerRow.indexOf("emailMember")];
            const emailGuest = updatedRowValues[headerRow.indexOf("emailGuest")];
            if (emailMember || emailGuest) {
              await sendEmailNotification(
                emailMember,
                emailGuest,
                pdfUrl,
                docUrl,
                updatedRowValues,
                headerRow
              );
              logger.info('Notificación de correo electrónico enviada', contractID);
            } else {
              logger.warn('No se enviará notificación por correo electrónico', contractID);
            }
          } else {
            logger.error('No se recibieron URLs de documentos de AppScript', contractID);
            if (appsScriptResponseData?.logs) {
              logger.error('Logs de AppScript:', appsScriptResponseData.logs);
            }
            return createResponse(
              { 
                error: "Error al generar documentos: No se recibieron URLs válidas",
                logs: appsScriptResponseData?.logs || []
              },
              500
            );
          }
        } else {
          logger.error(
            `[update-payment-status] Error al generar documentos para contractID: ${contractID}. Status: ${appsScriptResponse.status}`
          );
          const errorData = await appsScriptResponse.json();
          if (errorData?.logs) {
            logger.error('Logs de AppScript:', errorData.logs);
          }
          return createResponse(
            { 
              error: `Error al generar documentos: ${errorData?.error || 'Error desconocido'}`,
              logs: errorData?.logs || []
            },
            500
          );
        }
      } catch (error) {
        logger.error(
          `[update-payment-status] Error al interactuar con Apps Script para contractID: ${contractID}:`,
          error
        );
        return createResponse(
          { 
            error: `Error al interactuar con Apps Script: ${error.message}`,
            logs: []
          },
          500
        );
      }
    } else if (existingPaymentId) {
      logger.info('Pago existente encontrado, omitiendo generación y notificaciones', contractID);
    }

    logger.info('Proceso completado', contractID);
    return createResponse(
      {
        message: "Payment details updated successfully, document generation and follow-up initiated (if applicable).",
        paymentId: paymentIdToUse,
        fechaDePago: fechaDePagoToUse,
      },
      200
    );
  } catch (error) {
    logger.error(`Error en el procesamiento: ${error.message}`, contractID);
    return createResponse(
      { error: error.message },
      500
    );
  }
}
