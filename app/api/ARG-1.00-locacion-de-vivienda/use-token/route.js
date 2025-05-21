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
    const pdfFileColumnIndex = headerRow.indexOf("pdffile");
    const docFileColumnIndex = headerRow.indexOf("docfile");

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
    if (pdfFileColumnIndex === -1) console.warn("pdffile column not found.");
    if (docFileColumnIndex === -1) console.warn("docfile column not found.");

    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:VM`, // Adjust range as needed
    });
    const allRows = allRowsResponse.data?.values || [];

    let rowIndex = -1;
    let rowDataToPass;
    let existingPaymentId;
    let existingPdfFile;
    let existingDocFile;
    for (let i = 1; i < allRows.length; i++) {
      if (
        allRows[i][contractIDColumnIndex] === contractID &&
        allRows[i][memberstackIDColumnIndex] === memberstackID
      ) {
        rowIndex = i + 1;
        rowDataToPass = allRows[i];
        existingPaymentId = allRows[i][paymentIdColumnIndex]; // Get existing payment_id
        existingPdfFile = allRows[i][pdfFileColumnIndex];
        existingDocFile = allRows[i][docFileColumnIndex];
        break;
      }
    }

    if (rowIndex !== -1) {
      const paymentId = uuidv4();
      const nowArgentina = new Date().toLocaleString("en-US", {
        timeZone: "America/Argentina/Buenos_Aires",
      });

      const updatedRowValues = allRows[rowIndex - 1] || [];
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
      // --- Call Apps Script for document generation (if payment_id was empty) ---
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
          rowData: rowDataToPass,
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

            // --- Update Google Sheets with document links ---
            if (
              pdfUrl &&
              docUrl &&
              pdfFileColumnIndex !== -1 &&
              docFileColumnIndex !== -1
            ) {
              const updateLinksRange = `${sheetName}!${getColumnLetter(pdfFileColumnIndex + 1)}${rowIndex}:${getColumnLetter(docFileColumnIndex + 1)}${rowIndex}`;
              await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: updateLinksRange,
                valueInputOption: "RAW",
                requestBody: { values: [[pdfUrl, docUrl]] },
              });
              console.log("Google Sheets updated with PDF and DOC links.");
            }

            // --- Interact with Webflow API ---
            const webflowApiToken = process.env.WEBFLOW_API_TOKEN; // Using the correct environment variable
            if (
              webflowApiToken &&
              process.env.WEBFLOW_USER_COLLECTION_ID &&
              pdfUrl &&
              docUrl &&
              !existingPaymentId
            ) {
              const webflowCollectionId =
                process.env.WEBFLOW_USER_COLLECTION_ID; // Using the correct environment variable
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

              const fieldData = {
                pdffile: pdfUrl, // Ensure 'pdffile' matches your Webflow field slug
                docfile: docUrl, // Ensure 'docfile' matches your Webflow field slug
                name: contractID,
                slug: contractID,
                _draft: false,
                _published: true,
              };

              let webflowResponse;
              let requestBody;
              const updateUrl = existingItem
                ? `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/${existingItem._id}/live`
                : `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/live`; // Use /live for create as well

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
                console.error(
                  "Error interacting with Webflow API:",
                  webflowResult
                );
                // Consider how to handle Webflow API errors
              }
            } else {
              console.warn(
                "WEBFLOW_API_TOKEN or collection ID not configured, or document URLs missing, or payment already processed. Skipping Webflow update."
              );
            }

            // --- Send Email via Resend ---
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
