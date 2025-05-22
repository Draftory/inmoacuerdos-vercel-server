import { google } from "googleapis";
import { NextResponse } from "next/server";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

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
  console.log(
    "Starting API request for Token payment update, document generation, Webflow update, and email"
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
      "Warning: VERCEL_API_SECRET environment variable is not set in Vercel, but APPS_SCRIPT_GENERATE_DOC_URL is. The Google Apps Script for document generation will NOT be triggered."
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
      "Warning: RESEND_API_KEY environment variable is not set in Vercel, but RESEND_EMAIL_FROM is. Emails will NOT be sent."
    );
  }

  try {
    const { contractID, memberstackID, emailMember, emailGuest } =
      await req.json();
    console.log("Received data:", {
      contractID,
      memberstackID,
      emailMember,
      emailGuest,
    });

    if (!contractID || !memberstackID) {
      throw new Error(
        "contractID and memberstackID are required in the request body."
      );
    }

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

    // Fetch header row to find column indices
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    const headerRow = headerResponse.data?.values?.[0] || [];
    const contractIDColumnIndex = headerRow.indexOf("contractID");
    const memberstackIDColumnIndex = headerRow.indexOf("MemberstackID");
    const tipoDePagoColumnIndex = headerRow.indexOf("tipoDePago");
    const estadoDePagoColumnIndex = headerRow.indexOf("estadoDePago");
    const paymentIdColumnIndex = headerRow.indexOf("payment_id");
    const fechaDePagoColumnIndex = headerRow.indexOf("fechaDePago");
    const pdfFileColumnIndex = headerRow.indexOf("PDFFile");
    const docFileColumnIndex = headerRow.indexOf("DOCFile");
    const webflowItemIdColumnIndex = headerRow.indexOf("WebflowItemID");
    const editlinkColumnIndex = headerRow.indexOf("Editlink"); // Modified to use "Editlink"

    // Validate essential columns
    if (contractIDColumnIndex === -1)
      throw new Error("contractID column not found.");
    if (memberstackIDColumnIndex === -1)
      throw new Error("MemberstackID column not found.");
    if (tipoDePagoColumnIndex === -1)
      throw new Error("tipoDePago column not found.");
    if (estadoDePagoColumnIndex === -1)
      throw new Error("estadoDePago column not found.");
    if (paymentIdColumnIndex === -1)
      throw new Error("payment_id column not found.");
    if (fechaDePagoColumnIndex === -1)
      throw new Error("fechaDePago column not found.");

    // Warn for non-essential but useful columns
    if (pdfFileColumnIndex === -1) console.warn("PDFFile column not found.");
    if (docFileColumnIndex === -1) console.warn("DOCFile column not found.");
    if (webflowItemIdColumnIndex === -1)
      console.warn(
        "WebflowItemID column not found in Google Sheet. Webflow updates might rely on 'name' field search."
      );
    if (editlinkColumnIndex === -1)
      // Warn if editlink column is not found
      console.warn("Editlink column not found in Google Sheet."); // Updated warning message

    // Fetch all rows to find the matching contract
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Fetch a wide range to cover all potential columns
    });
    const allRows = allRowsResponse.data?.values || [];

    let rowIndex = -1;
    let rowDataToPass; // This will hold the original row data before updates
    let existingPaymentId;
    for (let i = 1; i < allRows.length; i++) {
      if (
        allRows[i][contractIDColumnIndex] === contractID &&
        allRows[i][memberstackIDColumnIndex] === memberstackID
      ) {
        rowIndex = i + 1; // Google Sheets row index is 1-based
        rowDataToPass = allRows[i]; // Store the full row data
        existingPaymentId = allRows[i][paymentIdColumnIndex];
        break;
      }
    }

    if (rowIndex !== -1) {
      // Update payment details in Google Sheet
      const paymentId = uuidv4();
      const nowArgentina = new Date().toLocaleString("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
      });

      const updatedRowValues = allRows[rowIndex - 1] || []; // Get the current row data for update
      updatedRowValues[tipoDePagoColumnIndex] = "Token";
      updatedRowValues[estadoDePagoColumnIndex] = "Pagado";
      updatedRowValues[paymentIdColumnIndex] = paymentId;
      updatedRowValues[fechaDePagoColumnIndex] = nowArgentina;

      const lastColumnLetter = getColumnLetter(updatedRowValues.length);

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A${rowIndex}:${lastColumnLetter}${rowIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [updatedRowValues] },
      });

      console.log(
        `Payment details updated for contractID: ${contractID}, MemberstackID: ${memberstackID} in row ${rowIndex}. Payment ID: ${paymentId}, Fecha de Pago: ${nowArgentina}`
      );

      let appsScriptResponseData = {};
      // Trigger document generation via Google Apps Script only if no existing payment ID
      if (
        !existingPaymentId &&
        process.env.APPS_SCRIPT_GENERATE_DOC_URL &&
        process.env.VERCEL_API_SECRET
      ) {
        const dataToSendToAppsScript = {
          secret: process.env.VERCEL_API_SECRET,
          spreadsheetId: spreadsheetId,
          sheetName: sheetName,
          rowNumber: rowIndex,
          rowData: rowDataToPass, // Still sending original rowDataToPass to Apps Script as it might expect it
          headers: headerRow,
        };
        console.log(
          "Sending request to Apps Script for document generation:",
          dataToSendToAppsScript
        );
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

            // Webflow Integration
            const webflowApiToken = process.env.WEBFLOW_API_TOKEN;
            if (
              webflowApiToken &&
              process.env.WEBFLOW_USER_COLLECTION_ID &&
              pdfUrl &&
              docUrl &&
              !existingPaymentId // Only update/create in Webflow if this is a new payment
            ) {
              const webflowCollectionId =
                process.env.WEBFLOW_USER_COLLECTION_ID;
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

              // MODIFICACIÓN: Asignar el editlink directamente desde rowDataToPass
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
                      Authorization: `Bearer ${webflowApiToken}`,
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
                    Authorization: `Bearer ${webflowApiToken}`,
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
                  Authorization: `Bearer ${webflowApiToken}`,
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

            // Resend Email Integration
            if (
              process.env.RESEND_API_KEY &&
              process.env.RESEND_EMAIL_FROM &&
              pdfUrl &&
              docUrl &&
              !existingPaymentId
            ) {
              const emailData = {
                to: emailMember || emailGuest,
                from: process.env.RESEND_EMAIL_FROM,
                subject: "Your Document is Ready!",
                html: `<p>Here are the links to your documents:</p>
                       <p><a href="${pdfUrl}">View PDF</a></p>
                       <p><a href="${docUrl}">View DOC</a></p>`,
              };
              console.log("Sending email via Resend:", emailData);
              try {
                const resendResponse = await fetch(
                  "https://api.resend.com/emails",
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(emailData),
                  }
                );
                const resendResult = await resendResponse.json();
                console.log("Resend API Response:", resendResult);
                if (!resendResponse.ok) {
                  console.error(
                    "Error sending email via Resend:",
                    resendResult
                  );
                }
              } catch (error) {
                console.error("Error sending email via Resend:", error);
              }
            } else {
              console.warn(
                "Resend API key or email from not configured, or document URLs missing, or payment already processed. Skipping email sending."
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
          "APPS_SCRIPT_GENERATE_DOC_URL or VERCEL_API_SECRET not configured for document generation."
        );
      }

      return new NextResponse(
        JSON.stringify({
          message:
            "Payment details updated successfully, document generation and follow-up initiated (if applicable).",
          paymentId: paymentId,
          fechaDePago: nowArgentina,
        }),
        { status: 200, headers: responseHeaders }
      );
    } else {
      console.log(
        `contractID: ${contractID} and MemberstackID: ${memberstackID} not found in the spreadsheet.`
      );
      return new NextResponse(
        JSON.stringify({
          error:
            "Matching contractID and MemberstackID not found in the spreadsheet.",
        }),
        { status: 404, headers: responseHeaders }
      );
    }
  } catch (error) {
    console.error(
      "POST Error (Update Token Payment with Doc Gen/Email/Webflow):",
      error
    );
    return new NextResponse(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: responseHeaders,
    });
  }
}

// Helper function to convert column number to letter (e.g., 1 -> A, 27 -> AA)
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

// Helper function to map form data from Google Sheet to Webflow field slugs
function mapFormDataToWebflowFields(formData) {
  return {
    editlink: formData["editlink"] || null, // Now dynamically pulling from formData
    denominacionlegallocadorpj1:
      formData["denominacionLegalLocadorPJ1"] || null,
    nombrelocatariopf1: formData["nombreLocatarioPF1"] || null,
    timestamp: formData["timestamp"] || null,
    status: formData["status"] || null,
    contrato: formData["Contrato"] || null,
    memberstackid: formData["MemberstackID"] || null,
    name: formData["contractID"] || "", // 'name' field is crucial for search/identification
    slug: formData["contractID"] || "", // 'slug' should generally be unique
    domicilioinmueblelocado: formData["domicilioInmuebleLocado"] || null,
    ciudadinmueblelocado: formData["ciudadInmuebleLocado"] || null,
    nombrelocadorpf1: formData["nombreLocadorPF1"] || null,
    denominacionlegallocatariopj1:
      formData["denominacionLegalLocatarioPJ1"] || null,
    hiddeninputlocacionfechainicio:
      formData["hiddenInputLocacionFechaInicio"] || null,
    hiddeninputlocacionfechatermino:
      formData["hiddenInputLocacionFechaTermino"] || null,
    pdffile: formData["pdffile"] || null, // These will be overridden by actual URLs from Apps Script
    docfile: formData["docfile"] || null, // These will be overridden by actual URLs from Apps Script
  };
}
