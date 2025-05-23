import { google } from "googleapis";
import { NextResponse } from "next/server";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid"; // Required for generating UUIDs if payment_id is not provided

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

// Environment variables
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_GENERATE_DOC_URL;
const VERCEL_API_SECRET = process.env.VERCEL_API_SECRET;
const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_USER_COLLECTION_ID = process.env.WEBFLOW_USER_COLLECTION_ID;
const RESEND_API_KEY = process.env.RESEND_API_KEY; // Used by the custom email endpoint
const RESEND_EMAIL_FROM = process.env.RESEND_EMAIL_FROM; // Used by the custom email endpoint

/**
 * Handles OPTIONS requests for CORS preflight.
 * @param {Request} req - The incoming request object.
 * @returns {NextResponse} A response with appropriate CORS headers.
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
 * Handles POST requests to update payment status in Google Sheets,
 * trigger document generation via Google Apps Script, update Webflow,
 * and send email notifications.
 * @param {Request} req - The incoming request object containing payment data.
 * @returns {NextResponse} A JSON response indicating the operation's success or failure.
 */
export async function POST(req) {
  console.log(
    "Starting API request for payment update, document generation, Webflow update, and email"
  );
  const origin = req.headers.get("origin");
  const responseHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Environment variable warnings
  if (
    !process.env.VERCEL_API_SECRET &&
    process.env.APPS_SCRIPT_GENERATE_DOC_URL
  ) {
    console.warn(
      "Warning: VERCEL_API_SECRET environment variable is not set in Vercel, but APPS_SCRIPT_GENERATE_DOC_URL is. The Google Apps Script for document generation will NOT be triggered securely."
    );
  }

  if (
    !process.env.WEBFLOW_API_TOKEN &&
    process.env.WEBFLOW_USER_COLLECTION_ID
  ) {
    console.warn(
      "Warning: WEBFLOW_API_TOKEN environment variable is not set in Vercel, but WEBFLOW_USER_COLLECTION_ID is. Webflow will NOT be updated."
    );
  }

  if (!process.env.RESEND_API_KEY && process.env.RESEND_EMAIL_FROM) {
    console.warn(
      "Warning: RESEND_API_KEY environment variable is not set in Vercel, but RESEND_EMAIL_FROM is. Emails might not be sent correctly by the custom endpoint."
    );
  }

  try {
    // Destructure all expected properties from the request body
    const {
      contractID,
      memberstackID,
      emailMember, // Expected from the token payment script
      emailGuest, // Expected from the token payment script
      payment_id, // Expected from Mercado Pago webhook
      estadoDePago, // Expected from Mercado Pago webhook
      fechaDePago, // Expected from Mercado Pago webhook
      tipoDePago: tipoDePagoRecibido, // Expected from Mercado Pago webhook
    } = await req.json();

    console.log("Received data:", {
      contractID,
      memberstackID,
      emailMember,
      emailGuest,
      payment_id,
      estadoDePago,
      fechaDePago,
      tipoDePagoRecibido,
    });

    // Validate essential input
    if (!contractID) {
      throw new Error("contractID is required in the request body.");
    }

    // Decode Google credentials from base64 environment variable
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

    // Authenticate with Google Sheets API
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: "https://www.googleapis.com/auth/spreadsheets",
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });

    const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
    const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;

    // Fetch header row to find column indices
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    const headerRow = headerResponse.data?.values?.[0] || [];

    // Get column indices, throwing errors for essential ones and warnings for others
    const contractIDColumnIndex = headerRow.indexOf("contractID");
    const memberstackIDColumnIndex = headerRow.indexOf("MemberstackID");
    const tipoDePagoColumnIndex = headerRow.indexOf("tipoDePago");
    const estadoDePagoColumnIndex = headerRow.indexOf("estadoDePago");
    const paymentIdColumnIndex = headerRow.indexOf("payment_id");
    const fechaDePagoColumnIndex = headerRow.indexOf("fechaDePago");
    const pdfFileColumnIndex = headerRow.indexOf("PDFFile");
    const docFileColumnIndex = headerRow.indexOf("DOCFile");
    const webflowItemIdColumnIndex = headerRow.indexOf("WebflowItemID");
    const editlinkColumnIndex = headerRow.indexOf("Editlink");
    const statusColumnIndex = headerRow.indexOf("status"); // Added status column
    const emailMemberIndex = headerRow.indexOf("emailMember"); // Added for email
    const emailGuestIndex = headerRow.indexOf("emailGuest"); // Added for email
    const nombreLocatarioPF1Index = headerRow.indexOf("nombreLocatarioPF1"); // Added for email subject
    const nombreLocadorPF1Index = headerRow.indexOf("nombreLocadorPF1"); // Added for email subject
    const denominacionLegalLocadorPJ1Index = headerRow.indexOf(
      "denominacionLegalLocadorPJ1"
    ); // Added for email subject
    const denominacionLegalLocatarioPJ1Index = headerRow.indexOf(
      "denominacionLegalLocatarioPJ1"
    ); // Added for email subject

    // Validate essential columns
    if (contractIDColumnIndex === -1)
      throw new Error("contractID column not found in Google Sheet.");
    // MemberstackID might not always be present in Mercado Pago flow, so make it a warning if not found
    if (memberstackIDColumnIndex === -1)
      console.warn(
        "MemberstackID column not found. Search might be less precise."
      );
    if (tipoDePagoColumnIndex === -1)
      throw new Error("tipoDePago column not found in Google Sheet.");
    if (estadoDePagoColumnIndex === -1)
      throw new Error("estadoDePago column not found in Google Sheet.");
    if (paymentIdColumnIndex === -1)
      throw new Error("payment_id column not found in Google Sheet.");
    if (fechaDePagoColumnIndex === -1)
      throw new Error("fechaDePago column not found in Google Sheet.");
    if (statusColumnIndex === -1)
      throw new Error("status column not found in Google Sheet.");

    // Warn for non-essential but useful columns
    if (pdfFileColumnIndex === -1) console.warn("PDFFile column not found.");
    if (docFileColumnIndex === -1) console.warn("DOCFile column not found.");
    if (webflowItemIdColumnIndex === -1)
      console.warn(
        "WebflowItemID column not found in Google Sheet. Webflow updates might rely on 'name' field search."
      );
    if (editlinkColumnIndex === -1)
      console.warn("Editlink column not found in Google Sheet.");
    if (emailMemberIndex === -1) console.warn("emailMember column not found.");
    if (emailGuestIndex === -1) console.warn("emailGuest column not found.");
    if (nombreLocatarioPF1Index === -1)
      console.warn("nombreLocatarioPF1 column not found.");
    if (nombreLocadorPF1Index === -1)
      console.warn("nombreLocadorPF1 column not found.");
    if (denominacionLegalLocadorPJ1Index === -1)
      console.warn("denominacionLegalLocadorPJ1 column not found.");
    if (denominacionLegalLocatarioPJ1Index === -1)
      console.warn("denominacionLegalLocatarioPJ1 column not found.");

    // Fetch all rows to find the matching contract
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Fetch a wide range to cover all potential columns
    });
    const allRows = allRowsResponse.data?.values || [];

    let rowIndex = -1;
    let rowDataToPass; // This will hold the original row data before updates
    let existingPaymentId; // To check if a payment ID already exists for this contract

    // Find the row matching the contractID and optionally memberstackID
    for (let i = 1; i < allRows.length; i++) {
      // Use memberstackID for more precise matching if available, otherwise rely on contractID
      const isMemberstackMatch =
        memberstackIDColumnIndex !== -1
          ? allRows[i][memberstackIDColumnIndex] === memberstackID
          : true;
      if (
        allRows[i][contractIDColumnIndex] === contractID &&
        isMemberstackMatch
      ) {
        rowIndex = i + 1; // Google Sheets row index is 1-based
        rowDataToPass = allRows[i]; // Store the full row data
        existingPaymentId = allRows[i][paymentIdColumnIndex];
        break;
      }
    }

    if (rowIndex !== -1) {
      // Prepare payment details for update in Google Sheet
      const paymentIdToUse = payment_id || uuidv4(); // Use provided payment_id or generate a new one
      const nowArgentina = new Date().toLocaleString("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
      });
      // Use provided fechaDePago or current time, convert to ISO string for consistency
      const fechaDePagoToUse = fechaDePago
        ? new Date(fechaDePago).toISOString()
        : nowArgentina;
      // Map 'approved' status to 'Pagado', otherwise use original status
      const estadoDePagoToUse =
        estadoDePago === "approved" ? "Pagado" : estadoDePago;
      // Use provided tipoDePago or default to 'Mercado Pago'
      const tipoDePagoToUse = tipoDePagoRecibido || "Mercado Pago";

      const updatedRowValues = [...allRows[rowIndex - 1]] || []; // Create a copy to modify
      updatedRowValues[tipoDePagoColumnIndex] = tipoDePagoToUse;
      updatedRowValues[estadoDePagoColumnIndex] = estadoDePagoToUse;
      updatedRowValues[paymentIdColumnIndex] = paymentIdToUse;
      updatedRowValues[fechaDePagoColumnIndex] = fechaDePagoToUse;

      // Update 'status' column to 'Contrato' if payment is approved
      if (estadoDePago && estadoDePago.toLowerCase() === "approved") {
        updatedRowValues[statusColumnIndex] = "Contrato";
      }

      const lastColumnLetter = getColumnLetter(updatedRowValues.length);

      // Update Google Sheet with payment details
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:${lastColumnLetter}${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [updatedRowValues] },
      });

      console.log(
        `Payment details updated for contractID: ${contractID}, MemberstackID: ${memberstackID || "N/A"} in row ${rowIndex}. Payment ID: ${paymentIdToUse}, Fecha de Pago: ${fechaDePagoToUse}, Estado de Pago: ${estadoDePagoToUse}, Tipo de Pago: ${tipoDePagoToUse}`
      );

      let appsScriptResponseData = {};
      // Trigger document generation via Google Apps Script
      // Only if payment is approved, no existing payment ID, and Apps Script URL/Secret are configured
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
          rowData: rowDataToPass, // Send original rowData to Apps Script
          headers: headerRow,
        };
        console.log(
          "Sending request to Apps Script for document generation:",
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
            console.log("Apps Script response:", appsScriptResponseData);

            const pdfUrl = appsScriptResponseData?.pdfUrl;
            const docUrl = appsScriptResponseData?.docUrl;

            // Update Google Sheets with DOC and PDF links if available
            if (
              pdfUrl &&
              docUrl &&
              pdfFileColumnIndex !== -1 &&
              docFileColumnIndex !== -1
            ) {
              // Ensure the range covers both DOCFile and PDFFile columns
              const updateLinksRange = `${sheetName}!${getColumnLetter(docFileColumnIndex + 1)}${rowIndex}:${getColumnLetter(pdfFileColumnIndex + 1)}${rowIndex}`;
              await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateLinksRange,
                valueInputOption: "RAW",
                requestBody: { values: [[docUrl, pdfUrl]] },
              });
              console.log("Google Sheets updated with DOC and PDF links.");
            }

            // --- Webflow Integration ---
            // Only update/create in Webflow if API token/collection ID are set,
            // document URLs are available, and it's a new payment.
            if (
              WEBFLOW_API_TOKEN &&
              WEBFLOW_USER_COLLECTION_ID &&
              pdfUrl &&
              docUrl &&
              !existingPaymentId // Crucial: only update Webflow for new payments
            ) {
              const webflowCollectionId = WEBFLOW_USER_COLLECTION_ID;
              const itemNameFieldSlug = "name"; // Assuming 'name' is the field used for contractID in Webflow

              // Create formData object from headerRow and UPDATED row data
              const formData = {};
              headerRow.forEach((header, index) => {
                formData[header] = updatedRowValues[index]; // Use updatedRowValues here
              });

              // Map all fields from formData to Webflow fields
              const fieldData = mapFormDataToWebflowFields(formData);
              // Override pdffile and docfile with the actual URLs from Apps Script
              fieldData.pdffile = pdfUrl;
              fieldData.docfile = docUrl;

              // Assign editlink directly from rowDataToPass (original data)
              if (
                editlinkColumnIndex !== -1 &&
                rowDataToPass[editlinkColumnIndex]
              ) {
                fieldData.editlink = rowDataToPass[editlinkColumnIndex];
              }

              let existingItem = null;
              let webflowItemIdFromSheet = null;

              // 1. Try to get Webflow Item ID from Google Sheet first
              if (
                webflowItemIdColumnIndex !== -1 &&
                rowDataToPass[webflowItemIdColumnIndex]
              ) {
                webflowItemIdFromSheet =
                  rowDataToPass[webflowItemIdColumnIndex];
                console.log(
                  `Attempting to fetch Webflow item directly using ID from sheet: ${webflowItemIdFromSheet}`
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
                      "Webflow item found directly using ID from sheet:",
                      existingItem.id
                    );
                  } else {
                    console.warn(
                      `Could not find Webflow item directly with ID ${webflowItemIdFromSheet}. Status: ${directItemResponse.status}`
                    );
                  }
                } catch (error) {
                  console.error(
                    `Error fetching Webflow item directly by ID: ${error}`
                  );
                }
              }

              // 2. If not found by ID from sheet, try searching by name (contractID)
              if (!existingItem) {
                console.log(
                  `Webflow item not found by ID from sheet, attempting to search by name: ${contractID}`
                );
                const searchUrl = new URL(
                  `https://api.webflow.com/v2/collections/${webflowCollectionId}/items`
                );
                searchUrl.searchParams.set(itemNameFieldSlug, contractID);

                console.log("Webflow search URL:", searchUrl.toString());
                const listItemsResponse = await fetch(searchUrl.toString(), {
                  method: "GET",
                  headers: {
                    Authorization: `Bearer ${WEBFLOW_API_TOKEN}`,
                    "accept-version": "2.0.0",
                  },
                });
                console.log(
                  "Webflow search response status:",
                  listItemsResponse.status
                );
                const listItemsData = await listItemsResponse.json();
                console.log(
                  "Raw Webflow search by name response data:",
                  JSON.stringify(listItemsData, null, 2)
                );

                // IMPORTANT FIX: Only check the 'items' array for existing items
                if (listItemsData.items && listItemsData.items.length > 0) {
                  existingItem = listItemsData.items[0];
                  console.log(
                    "Found existing Webflow item via name search (from items array):",
                    existingItem.id
                  );
                } else {
                  console.log("No existing Webflow item found with that name.");
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
                `Webflow ${method} Request Body:`,
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
              console.log("Webflow API Response:", webflowResult);

              if (!webflowResponse.ok) {
                console.error(
                  "Error interacting with Webflow API:",
                  webflowResult
                );
              } else if (
                method === "POST" &&
                webflowResult.id &&
                webflowItemIdColumnIndex !== -1
              ) {
                // If a new item was created, update Google Sheet with its Webflow ID
                const updateWebflowIdRange = `${sheetName}!${getColumnLetter(webflowItemIdColumnIndex + 1)}${rowIndex}`;
                await sheets.spreadsheets.values.update({
                  spreadsheetId,
                  range: updateWebflowIdRange,
                  valueInputOption: "RAW",
                  requestBody: { values: [[webflowResult.id]] },
                });
                console.log(
                  `Google Sheets updated with new Webflow Item ID: ${webflowResult.id}`
                );
              }
            } else {
              console.warn(
                "WEBFLOW_API_TOKEN or collection ID not configured, or document URLs missing, or payment already processed. Skipping Webflow update."
              );
            }

            // --- Email Integration (using custom Vercel endpoint) ---
            // Only send email if PDF URL is available and payment is approved and new
            if (
              pdfUrl && // Ensure PDF URL is available
              docUrl && // Ensure DOC URL is available
              !existingPaymentId // Only send email if this is a new payment
            ) {
              try {
                // Get relevant column values for email
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

                // Dynamically construct the email subject
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
                  "https://inmoacuerdos-vercel-server.vercel.app/api/Resend/email-one-time-purchase"; // Ensure this URL is correct

                const sendEmailToCustomEndpoint = async (toEmail) => {
                  if (!toEmail) return; // Do not send if email is empty

                  const payload = {
                    to: toEmail,
                    subject: subject,
                    name: nombreCliente,
                    linkPDF: pdfUrl, // Use pdfUrl from Apps Script response
                    linkDOC: docUrl, // Use docUrl from Apps Script response
                    contractTypeDescription: contractTypeDescription,
                  };

                  console.log(
                    `Sending email to ${toEmail} via custom Vercel endpoint:`,
                    payload
                  );
                  try {
                    const response = await fetch(vercelApiUrl, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    const responseText = await response.text(); // Get text to log even if not JSON
                    if (response.ok) {
                      console.log(
                        `Email sent to ${toEmail} via Vercel. Response: ${responseText}`
                      );
                    } else {
                      console.error(
                        `Error sending email to ${toEmail} via Vercel. Status: ${response.status}, Response: ${responseText}`
                      );
                    }
                  } catch (error) {
                    console.error(
                      `Error sending email to ${toEmail} via Vercel:`,
                      error
                    );
                  }
                };

                // Send email to member
                await sendEmailToCustomEndpoint(currentEmailMember);
                // Send email to guest
                await sendEmailToCustomEndpoint(currentEmailGuest);
              } catch (error) {
                console.error(
                  "Error in Resend Email Integration (custom endpoint):",
                  error
                );
              }
            } else {
              console.warn(
                "Document URLs missing or payment already processed. Skipping email sending via custom endpoint."
              );
            }
          } else {
            console.error(
              "Error calling Apps Script:",
              appsScriptResponse.statusText,
              await appsScriptResponse.text()
            );
          }
        } catch (error) {
          console.error("Error sending request to Apps Script:", error);
        }
      } else if (existingPaymentId) {
        console.log(
          "Payment ID already exists. Skipping document generation, Webflow update, and email."
        );
      } else {
        console.warn(
          "APPS_SCRIPT_GENERATE_DOC_URL or VERCEL_API_SECRET not configured for document generation, or payment not approved."
        );
      }

      return new NextResponse(
        JSON.stringify({
          message:
            "Payment details updated successfully, document generation and follow-up initiated (if applicable).",
          paymentId: paymentIdToUse,
          fechaDePago: fechaDePagoToUse,
        }),
        { status: 200, headers: responseHeaders }
      );
    } else {
      console.log(`contractID: ${contractID} not found in the spreadsheet.`);
      return new NextResponse(
        JSON.stringify({
          error: "Matching contractID not found in the spreadsheet.",
        }),
        { status: 404, headers: responseHeaders }
      );
    }
  } catch (error) {
    console.error(
      "POST Error (Update Payment Status with Doc Gen/Email/Webflow):",
      error
    );
    return new NextResponse(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: responseHeaders,
    });
  }
}

/**
 * Helper function to convert column number to letter (e.g., 1 -> A, 27 -> AA).
 * @param {number} columnNumber - The 1-based column number.
 * @returns {string} The corresponding column letter(s).
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
 * Helper function to map form data from Google Sheet to Webflow field slugs.
 * Ensures that the property names match the slugs in your Webflow collection.
 * @param {Object} formData - Object containing data from the Google Sheet row.
 * @returns {Object} Object with data mapped to Webflow field slugs.
 */
function mapFormDataToWebflowFields(formData) {
  return {
    editlink: formData["Editlink"] || null, // Ensure this matches your Webflow slug for editlink
    denominacionlegallocadorpj1:
      formData["denominacionLegalLocadorPJ1"] || null,
    nombrelocatariopf1: formData["nombreLocatarioPF1"] || null,
    timestamp: formData["timestamp"] || null,
    status: formData["status"] || null,
    contrato: formData["Contrato"] || null,
    memberstackid: formData["MemberstackID"] || null,
    name: formData["contractID"] || "", // 'name' field is crucial for search/identification in Webflow
    slug: formData["contractID"] || "", // 'slug' should generally be unique in Webflow
    domicilioinmueblelocado: formData["domicilioInmuebleLocado"] || null,
    ciudadinmueblelocado: formData["ciudadInmuebleLocado"] || null,
    nombrelocadorpf1: formData["nombreLocadorPF1"] || null,
    denominacionlegallocatariopj1:
      formData["denominacionLegalLocatarioPJ1"] || null,
    pdffile: formData["PDFFile"] || null, // These will be overridden by actual URLs from Apps Script
    docfile: formData["DOCFile"] || null, // These will be overridden by actual URLs from Apps Script
    hiddeninputlocacionfechainicio:
      formData["hiddenInputLocacionFechaInicio"] || null,
    hiddeninputlocacionfechatermino:
      formData["hiddenInputLocacionFechaTermino"] || null,
  };
}
