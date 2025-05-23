import { google } from "googleapis";
import { NextResponse } from "next/server";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid"; // Necesario para generar payment_id si no viene de Mercado Pago

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

// Variables de entorno
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_GENERATE_DOC_URL;
const VERCEL_API_SECRET = process.env.VERCEL_API_SECRET;
const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_USER_COLLECTION_ID = process.env.WEBFLOW_USER_COLLECTION_ID;
// NOTA: RESEND_API_KEY y RESEND_EMAIL_FROM no se usan directamente aquí para enviar,
// sino para el endpoint personalizado de Vercel.
// Las advertencias siguen siendo relevantes si el endpoint personalizado depende de ellas.

/**
 * Maneja las solicitudes OPTIONS para CORS.
 * @param {Request} req - El objeto de la solicitud.
 * @returns {NextResponse} Una respuesta con los encabezados CORS apropiados.
 */
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

/**
 * Maneja las solicitudes POST para actualizar el estado de pago, generar documentos,
 * actualizar Webflow y enviar correos electrónicos.
 * @param {Request} req - El objeto de la solicitud.
 * @returns {NextResponse} Una respuesta JSON indicando el resultado de la operación.
 */
export async function POST(req) {
  console.log(
    "Iniciando solicitud API para actualización de pago (Mercado Pago), generación de documentos, actualización de Webflow y envío de correo electrónico"
  );
  const origin = req.headers.get("origin");
  const responseHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Advertencias de variables de entorno
  if (!VERCEL_API_SECRET && APPS_SCRIPT_URL) {
    console.warn(
      "Advertencia: La variable de entorno VERCEL_API_SECRET no está configurada en Vercel, pero APPS_SCRIPT_GENERATE_DOC_URL sí lo está. El Google Apps Script para la generación de documentos NO se activará de forma segura."
    );
  }

  if (!WEBFLOW_API_TOKEN && WEBFLOW_USER_COLLECTION_ID) {
    console.warn(
      "Advertencia: La variable de entorno WEBFLOW_API_TOKEN no está configurada en Vercel, pero WEBFLOW_USER_COLLECTION_ID sí lo está. Webflow NO se actualizará."
    );
  }

  try {
    const paymentData = await req.json();
    console.log("Datos de pago recibidos (Mercado Pago):", paymentData);

    // Extraer datos relevantes del payload de Mercado Pago
    const {
      id: payment_id, // ID de la transacción de Mercado Pago
      status: estadoDePago, // 'approved', 'pending', 'rejected'
      date_approved: fechaDePago, // Fecha de aprobación
      external_reference: contractID, // Asumimos que contractID viene en external_reference
      payment_type_id: tipoDePago, // 'credit_card', 'ticket', etc.
      // Otros campos que puedas necesitar del payload de Mercado Pago
    } = paymentData;

    console.log("contractID recibido:", contractID);
    console.log("tipoDePago recibido:", tipoDePago);
    console.log("estadoDePago recibido:", estadoDePago);
    console.log("payment_id recibido:", payment_id);

    if (!contractID) {
      throw new Error(
        "contractID (external_reference) es requerido en el cuerpo de la solicitud."
      );
    }

    const googleCredentialsBase64 =
      process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;

    if (!googleCredentialsBase64) {
      throw new Error(
        "GOOGLE_APPLICATION_CREDENTIALS_SECRET no está configurada."
      );
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

    // Obtener la fila de encabezado para encontrar los índices de las columnas
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    const headerRow = headerResponse.data?.values?.[0] || [];

    const contractIDColumnIndex = headerRow.indexOf("contractID");
    const memberstackIDColumnIndex = headerRow.indexOf("MemberstackID"); // Puede ser necesario para búsquedas más precisas
    const tipoDePagoColumnIndex = headerRow.indexOf("tipoDePago");
    const estadoDePagoColumnIndex = headerRow.indexOf("estadoDePago");
    const paymentIdColumnIndex = headerRow.indexOf("payment_id");
    const fechaDePagoColumnIndex = headerRow.indexOf("fechaDePago");
    const pdfFileColumnIndex = headerRow.indexOf("PDFFile");
    const docFileColumnIndex = headerRow.indexOf("DOCFile");
    const webflowItemIdColumnIndex = headerRow.indexOf("WebflowItemID");
    const editlinkColumnIndex = headerRow.indexOf("Editlink");
    const statusColumnIndex = headerRow.indexOf("status"); // Columna 'status'

    // Validar columnas esenciales
    if (contractIDColumnIndex === -1)
      throw new Error("Columna 'contractID' no encontrada.");
    // if (memberstackIDColumnIndex === -1) console.warn("Columna 'MemberstackID' no encontrada. La búsqueda podría ser menos precisa.");
    if (tipoDePagoColumnIndex === -1)
      throw new Error("Columna 'tipoDePago' no encontrada.");
    if (estadoDePagoColumnIndex === -1)
      throw new Error("Columna 'estadoDePago' no encontrada.");
    if (paymentIdColumnIndex === -1)
      throw new Error("Columna 'payment_id' no encontrada.");
    if (fechaDePagoColumnIndex === -1)
      throw new Error("Columna 'fechaDePago' no encontrada.");
    if (statusColumnIndex === -1)
      throw new Error("Columna 'status' no encontrada.");

    // Advertir sobre columnas no esenciales pero útiles
    if (pdfFileColumnIndex === -1)
      console.warn("Columna 'PDFFile' no encontrada.");
    if (docFileColumnIndex === -1)
      console.warn("Columna 'DOCFile' no encontrada.");
    if (webflowItemIdColumnIndex === -1)
      console.warn(
        "Columna 'WebflowItemID' no encontrada en Google Sheet. Las actualizaciones de Webflow podrían depender de la búsqueda por 'name'."
      );
    if (editlinkColumnIndex === -1)
      console.warn("Columna 'Editlink' no encontrada en Google Sheet.");

    // Obtener todas las filas para encontrar el contrato coincidente
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Rango amplio para cubrir todas las columnas posibles
    });
    const allRows = allRowsResponse.data?.values || [];

    let rowIndex = -1;
    let rowDataToPass; // Esto contendrá los datos originales de la fila antes de las actualizaciones
    let existingPaymentId;
    for (let i = 1; i < allRows.length; i++) {
      // Buscar por contractID y opcionalmente por memberstackID si es necesario
      if (
        allRows[i][contractIDColumnIndex] === contractID
        // && (memberstackIDColumnIndex === -1 || allRows[i][memberstackIDColumnIndex] === memberstackID) // Descomentar si necesitas MemberstackID
      ) {
        rowIndex = i + 1; // El índice de la fila en Google Sheets es 1-basado
        rowDataToPass = allRows[i]; // Almacenar los datos completos de la fila
        existingPaymentId = allRows[i][paymentIdColumnIndex];
        break;
      }
    }

    if (rowIndex !== -1) {
      // Actualizar detalles de pago en Google Sheet
      const nowArgentina = new Date().toLocaleString("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
      });

      const updatedRowValues = allRows[rowIndex - 1] || []; // Obtener los datos actuales de la fila para actualizar
      updatedRowValues[tipoDePagoColumnIndex] = tipoDePago; // Tipo de pago de Mercado Pago
      updatedRowValues[estadoDePagoColumnIndex] =
        estadoDePago === "approved" ? "Pagado" : estadoDePago;
      updatedRowValues[paymentIdColumnIndex] = payment_id;
      updatedRowValues[fechaDePagoColumnIndex] = fechaDePago
        ? new Date(fechaDePago).toISOString() // Convertir a ISO string para consistencia
        : nowArgentina; // Usar la hora actual si no hay fecha de pago

      // Actualizar la columna 'status' a 'Contrato' si el pago es aprobado
      if (estadoDePago && estadoDePago.toLowerCase() === "approved") {
        updatedRowValues[statusColumnIndex] = "Contrato";
      }

      const lastColumnLetter = getColumnLetter(updatedRowValues.length);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:${lastColumnLetter}${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [updatedRowValues] },
      });

      console.log(
        `Detalles de pago actualizados para contractID: ${contractID} en la fila ${rowIndex}. Payment ID: ${payment_id}, Fecha de Pago: ${fechaDePago || nowArgentina}`
      );

      let appsScriptResponseData = {};
      // Activar la generación de documentos a través de Google Apps Script
      // Solo si el pago es aprobado y no hay un payment_id existente (para evitar duplicados)
      if (
        estadoDePago === "approved" &&
        !existingPaymentId &&
        APPS_SCRIPT_URL &&
        VERCEL_API_SECRET
      ) {
        const dataToSendToAppsScript = {
          secret: VERCEL_API_SECRET,
          spreadsheetId: spreadsheetId,
          sheetName: sheetName,
          rowNumber: rowIndex,
          rowData: rowDataToPass, // Se envía la data original de la fila
          headers: headerRow,
        };
        console.log(
          "Enviando solicitud a Apps Script para generación de documentos:",
          dataToSendToAppsScript
        );
        try {
          const appsScriptResponse = await fetch(APPS_SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dataToSendToAppsScript),
          });
          if (appsScriptResponse.ok) {
            appsScriptResponseData = await appsScriptResponse.json();
            console.log("Respuesta de Apps Script:", appsScriptResponseData);

            const pdfUrl = appsScriptResponseData?.pdfUrl;
            const docUrl = appsScriptResponseData?.docUrl;

            // Actualizar Google Sheets con los enlaces DOC y PDF si están disponibles
            if (
              pdfUrl &&
              docUrl &&
              pdfFileColumnIndex !== -1 &&
              docFileColumnIndex !== -1
            ) {
              const updateLinksRange = `${sheetName}!${getColumnLetter(docFileColumnIndex + 1)}${rowIndex}:${getColumnLetter(pdfFileColumnIndex + 1)}${rowIndex}`;
              await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateLinksRange,
                valueInputOption: "RAW",
                requestBody: { values: [[docUrl, pdfUrl]] },
              });
              console.log("Google Sheets actualizado con enlaces DOC y PDF.");
            }

            // --- Integración con Webflow ---
            // Solo actualizar/crear en Webflow si el pago es aprobado y no hay un payment_id existente
            if (
              estadoDePago === "approved" &&
              !existingPaymentId &&
              WEBFLOW_API_TOKEN &&
              WEBFLOW_USER_COLLECTION_ID &&
              pdfUrl && // Asegurarse de que las URLs de documentos estén disponibles
              docUrl
            ) {
              const webflowCollectionId = WEBFLOW_USER_COLLECTION_ID;
              const itemNameFieldSlug = "name"; // Asumiendo que 'name' es el campo para contractID en Webflow

              // Crear un objeto formData a partir de headerRow y los datos de la fila ACTUALIZADA
              const formData = {};
              headerRow.forEach((header, index) => {
                formData[header] = updatedRowValues[index]; // Usar updatedRowValues aquí
              });

              // Mapear todos los campos de formData a los campos de Webflow
              const fieldData = mapFormDataToWebflowFields(formData);
              // Sobrescribir pdffile y docfile con las URLs reales de Apps Script
              fieldData.pdffile = pdfUrl;
              fieldData.docfile = docUrl;

              // Asignar el editlink directamente desde rowDataToPass (datos originales)
              if (
                editlinkColumnIndex !== -1 &&
                rowDataToPass[editlinkColumnIndex]
              ) {
                fieldData.editlink = rowDataToPass[editlinkColumnIndex];
              }

              let existingItem = null;
              let webflowItemIdFromSheet = null;

              // 1. Intentar obtener el ID del Item de Webflow primero de Google Sheet
              if (
                webflowItemIdColumnIndex !== -1 &&
                rowDataToPass[webflowItemIdColumnIndex]
              ) {
                webflowItemIdFromSheet =
                  rowDataToPass[webflowItemIdColumnIndex];
                console.log(
                  `Intentando obtener el item de Webflow directamente usando el ID de la hoja: ${webflowItemIdFromSheet}`
                );
                try {
                  const directFetchUrl = `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/${webflowItemIdFromSheet}`;
                  const directItemResponse = await fetch(directFetchUrl, {
                    method: "GET",
                    headers: {
                      Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
                      "accept-version": "2.0.0",
                    },
                  });
                  if (directItemResponse.ok) {
                    existingItem = await directItemResponse.json();
                    console.log(
                      "Item de Webflow encontrado directamente usando el ID de la hoja:",
                      existingItem.id
                    );
                  } else {
                    console.warn(
                      `No se pudo encontrar el item de Webflow directamente con el ID ${webflowItemIdFromSheet}. Estado: ${directItemResponse.status}`
                    );
                  }
                } catch (error) {
                  console.error(
                    `Error al obtener el item de Webflow directamente por ID: ${error}`
                  );
                }
              }

              // 2. Si no se encontró por ID de la hoja, intentar buscar por nombre (contractID)
              if (!existingItem) {
                console.log(
                  `Item de Webflow no encontrado por ID de la hoja, intentando buscar por nombre: ${contractID}`
                );
                const searchUrl = new URL(
                  `https://api.webflow.com/v2/collections/${webflowCollectionId}/items`
                );
                searchUrl.searchParams.set(itemNameFieldSlug, contractID);

                console.log(
                  "URL de búsqueda de Webflow:",
                  searchUrl.toString()
                );
                const listItemsResponse = await fetch(searchUrl.toString(), {
                  method: "GET",
                  headers: {
                    Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
                    "accept-version": "2.0.0",
                  },
                });
                console.log(
                  "Estado de la respuesta de búsqueda de Webflow:",
                  listItemsResponse.status
                );
                const listItemsData = await listItemsResponse.json();
                console.log(
                  "Datos de respuesta de búsqueda de Webflow (raw):",
                  JSON.stringify(listItemsData, null, 2)
                );

                if (listItemsData.items && listItemsData.items.length > 0) {
                  existingItem = listItemsData.items[0];
                  console.log(
                    "Se encontró un item de Webflow existente mediante la búsqueda por nombre (desde el array de items):",
                    existingItem.id
                  );
                } else {
                  console.log(
                    "No se encontró ningún item de Webflow existente con ese nombre."
                  );
                }
              }

              const hasValidExistingItem = existingItem && existingItem.id;

              let webflowResponse;
              let requestBody;
              const updateUrl = hasValidExistingItem
                ? `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/${existingItem.id}/live`
                : `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/live`;

              const method = hasValidExistingItem ? "PATCH" : "POST";

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
                `Solicitud ${method} a Webflow - Cuerpo:`,
                JSON.stringify(requestBody)
              );

              webflowResponse = await fetch(updateUrl, {
                method: method,
                headers: {
                  Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
                  "accept-version": "2.0.0",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
              });

              const webflowResult = await webflowResponse.json();
              console.log("Respuesta de la API de Webflow:", webflowResult);

              if (!webflowResponse.ok) {
                console.error(
                  "Error al interactuar con la API de Webflow:",
                  webflowResult
                );
              } else if (
                method === "POST" &&
                webflowResult.id &&
                webflowItemIdColumnIndex !== -1
              ) {
                // Si se creó un nuevo item, actualizar Google Sheet con su ID de Webflow
                const updateWebflowIdRange = `${sheetName}!${getColumnLetter(webflowItemIdColumnIndex + 1)}${rowIndex}`;
                await sheets.spreadsheets.values.update({
                  spreadsheetId,
                  range: updateWebflowIdRange,
                  valueInputOption: "RAW",
                  requestBody: { values: [[webflowResult.id]] },
                });
                console.log(
                  `Google Sheets actualizado con el nuevo ID de Item de Webflow: ${webflowResult.id}`
                );
              }
            } else {
              console.warn(
                "Token de API de Webflow o ID de colección no configurados, o URLs de documentos faltantes, o pago ya procesado. Saltando actualización de Webflow."
              );
            }

            // --- Integración de envío de correo electrónico (con lógica de Apps Script) ---
            // Solo enviar correo si el pago es aprobado y no hay un payment_id existente
            if (
              estadoDePago === "approved" &&
              !existingPaymentId &&
              pdfUrl && // Asegurarse de que la URL del PDF esté disponible
              docUrl // Asegurarse de que la URL del DOC esté disponible
            ) {
              try {
                // Obtener índices de columnas relevantes para el email
                const emailMemberIndex = headerRow.indexOf("emailMember");
                const emailGuestIndex = headerRow.indexOf("emailGuest");
                const nombreLocatarioPF1Index =
                  headerRow.indexOf("nombreLocatarioPF1");
                const nombreLocadorPF1Index =
                  headerRow.indexOf("nombreLocadorPF1");
                const denominacionLegalLocadorPJ1Index = headerRow.indexOf(
                  "denominacionLegalLocadorPJ1"
                );
                const denominacionLegalLocatarioPJ1Index = headerRow.indexOf(
                  "denominacionLegalLocatarioPJ1"
                );

                // Obtener valores de la fila actualizada (updatedRowValues)
                const currentEmailMember =
                  emailMemberIndex !== -1
                    ? updatedRowValues[emailMemberIndex]
                    : null;
                const currentEmailGuest =
                  emailGuestIndex !== -1
                    ? updatedRowValues[emailGuestIndex]
                    : null;
                const nombreCliente =
                  nombreLocatarioPF1Index !== -1
                    ? updatedRowValues[nombreLocatarioPF1Index]
                    : "Estimado/a usuario";

                // Construir el asunto dinámicamente
                let subject =
                  "Tu Contrato de Locación de vivienda está listo - ";
                let locadorInfo = "Locador Desconocido";
                let locatarioInfo = "Locatario Desconocido";

                if (nombreLocadorPF1Index !== -1) {
                  locadorInfo = updatedRowValues[nombreLocadorPF1Index] || "";
                }
                if (denominacionLegalLocadorPJ1Index !== -1 && !locadorInfo) {
                  locadorInfo =
                    updatedRowValues[denominacionLegalLocadorPJ1Index] || "";
                }

                if (nombreLocatarioPF1Index !== -1) {
                  locatarioInfo =
                    updatedRowValues[nombreLocatarioPF1Index] || "";
                }
                if (
                  denominacionLegalLocatarioPJ1Index !== -1 &&
                  !locatarioInfo
                ) {
                  locatarioInfo =
                    updatedRowValues[denominacionLegalLocatarioPJ1Index] || "";
                }

                subject += `${locadorInfo} - ${locatarioInfo}`;

                const contractTypeDescription =
                  "Contrato de Locación de vivienda";
                const vercelApiUrl =
                  "https://inmoacuerdos-vercel-server.vercel.app/api/Resend/email-one-time-purchase"; // Asegúrate de que esta URL sea correcta

                const sendEmailToCustomEndpoint = async (toEmail) => {
                  if (!toEmail) return; // No enviar si el email está vacío

                  const payload = {
                    to: toEmail,
                    subject: subject,
                    name: nombreCliente,
                    linkPDF: pdfUrl, // Usar pdfUrl de la respuesta de Apps Script
                    linkDOC: docUrl, // Usar docUrl de la respuesta de Apps Script
                    contractTypeDescription: contractTypeDescription,
                  };

                  console.log(
                    `Enviando correo electrónico a ${toEmail} a través del endpoint personalizado de Vercel:`,
                    payload
                  );
                  try {
                    const response = await fetch(vercelApiUrl, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    const responseText = await response.text();
                    if (response.ok) {
                      console.log(
                        `Correo electrónico enviado a ${toEmail} a través de Vercel. Respuesta: ${responseText}`
                      );
                    } else {
                      console.error(
                        `Error al enviar correo electrónico a ${toEmail} a través de Vercel. Estado: ${response.status}, Respuesta: ${responseText}`
                      );
                    }
                  } catch (error) {
                    console.error(
                      `Error al enviar correo electrónico a ${toEmail} a través de Vercel:`,
                      error
                    );
                  }
                };

                // Enviar correo electrónico al miembro
                await sendEmailToCustomEndpoint(currentEmailMember);
                // Enviar correo electrónico al invitado
                await sendEmailToCustomEndpoint(currentEmailGuest);
              } catch (error) {
                console.error(
                  "Error en la integración de envío de correo electrónico (endpoint personalizado):",
                  error
                );
              }
            } else {
              console.warn(
                "URLs de documentos faltantes o pago no aprobado/ya procesado. Saltando envío de correo electrónico a través del endpoint personalizado."
              );
            }
          } else {
            console.error(
              "Error al llamar a Apps Script:",
              appsScriptResponse.statusText,
              await appsScriptResponse.text()
            );
          }
        } catch (error) {
          console.error("Error al enviar la solicitud a Apps Script:", error);
        }
      } else if (existingPaymentId) {
        console.log(
          "El ID de pago ya existe. Saltando la generación de documentos, la actualización de Webflow y el envío de correo electrónico."
        );
      } else {
        console.warn(
          "APPS_SCRIPT_GENERATE_DOC_URL o VERCEL_API_SECRET no configurados para la generación de documentos, o el pago no está aprobado."
        );
      }

      return new NextResponse(
        JSON.stringify({
          message:
            "Detalles de pago actualizados exitosamente, generación de documentos y seguimiento iniciados (si aplica).",
          paymentId: payment_id,
          fechaDePago: fechaDePago || nowArgentina,
        }),
        { status: 200, headers: responseHeaders }
      );
    } else {
      console.log(
        `contractID: ${contractID} no encontrado en la hoja de cálculo.`
      );
      return new NextResponse(
        JSON.stringify({
          error: "contractID no encontrado en la hoja de cálculo.",
        }),
        { status: 404, headers: responseHeaders }
      );
    }
  } catch (error) {
    console.error(
      "Error POST (Actualización de Pago con Generación de Doc/Email/Webflow):",
      error
    );
    return new NextResponse(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: responseHeaders,
    });
  }
}

/**
 * Función de ayuda para convertir el número de columna a letra (ej. 1 -> A, 27 -> AA).
 * @param {number} columnNumber - El número de la columna (1-basado).
 * @returns {string} La letra de la columna.
 */
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

/**
 * Función de ayuda para mapear los datos del formulario de Google Sheet a los slugs de campo de Webflow.
 * @param {Object} formData - Objeto con los datos de la fila de Google Sheet.
 * @returns {Object} Objeto con los datos mapeados a los slugs de Webflow.
 */
function mapFormDataToWebflowFields(formData) {
  return {
    editlink: formData["Editlink"] || null, // Asegúrate de usar "Editlink"
    denominacionlegallocadorpj1:
      formData["denominacionLegalLocadorPJ1"] || null,
    nombrelocatariopf1: formData["nombreLocatarioPF1"] || null,
    timestamp: formData["timestamp"] || null,
    status: formData["status"] || null,
    contrato: formData["Contrato"] || null,
    memberstackid: formData["MemberstackID"] || null,
    name: formData["contractID"] || "", // 'name' es crucial para búsqueda/identificación
    slug: formData["contractID"] || "", // 'slug' generalmente debe ser único
    domicilioinmueblelocado: formData["domicilioInmuebleLocado"] || null,
    ciudadinmueblelocado: formData["ciudadInmuebleLocado"] || null,
    nombrelocadorpf1: formData["nombreLocadorPF1"] || null,
    denominacionlegallocatariopj1:
      formData["denominacionLegalLocatarioPJ1"] || null,
    pdffile: formData["PDFFile"] || null, // Estos serán sobrescritos por las URLs reales de Apps Script
    docfile: formData["DOCFile"] || null, // Estos serán sobrescritos por las URLs reales de Apps Script
    // Asegúrate de que los nombres de las propiedades aquí coincidan con los slugs de campo en Webflow
    // Por ejemplo, si en Webflow tienes un campo 'fecha-inicio', aquí debería ser 'fechaInicio' o 'fecha_inicio'
    // dependiendo de cómo lo mapees.
    hiddeninputlocacionfechainicio:
      formData["hiddenInputLocacionFechaInicio"] || null,
    hiddeninputlocacionfechatermino:
      formData["hiddenInputLocacionFechaTermino"] || null,
  };
}
