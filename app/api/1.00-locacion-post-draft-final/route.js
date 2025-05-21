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
  const headers = {
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
        { status: 500 }
      );
    }

    // --- Interact with Webflow API ---
    const webflowApiToken = process.env.WEBFLOW_API_TOKEN; // Using the correct environment variable
    if (webflowApiToken) {
      const webflowCollectionId = process.env.WEBFLOW_USER_COLLECTION_ID; // Using the correct environment variable
      const itemNameFieldSlug = "name";

      const listItemsResponse = await fetch(
        `https://api.webflow.com/v2/collections/${webflowCollectionId}/items?${itemNameFieldSlug}=${contractID}`,
        {
          headers: {
            Authorization: `Bearer ${webflowApiToken}`,
            "Content-Type": "application/json",
          },
        }
      );
      const listItemsData = await listItemsResponse.json();
      const existingItem = listItemsData.items?.[0];

      const webflowFields = {
        name: contractID,
        slug: contractID,
        editlink: editLink,
        ...mapFormDataToWebflowFields(formData),
      };

      let webflowResponse;
      if (existingItem) {
        webflowResponse = await fetch(
          `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/${existingItem._id}`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${webflowApiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fields: webflowFields }),
          }
        );
      } else {
        webflowResponse = await fetch(
          `https://api.webflow.com/v2/collections/${webflowCollectionId}/items`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${webflowApiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ fields: webflowFields }),
          }
        );
      }

      const webflowResult = await webflowResponse.json();
      console.log("Webflow API Response:", webflowResult);

      if (!webflowResponse.ok) {
        console.error("Error interacting with Webflow API:", webflowResult);
        // Consider how to handle Webflow API errors
      }
    } else {
      console.warn("WEBFLOW_API_TOKEN not configured.");
    }

    // --- Call Apps Script for document generation (if "Contrato") ---
    let appsScriptResponseData = {};
    if (status === "Contrato") {
      const appsScriptUrl = process.env.APPS_SCRIPT_GENERATE_DOC_URL;
      const vercelSecret = process.env.VERCEL_API_SECRET;
      if (appsScriptUrl && vercelSecret) {
        const dataToSendToAppsScript = {
          spreadsheetId: process.env.LOCACION_POST_DATABASE_SHEET_ID,
          sheetName: process.env.LOCACION_POST_DATABASE_SHEET_NAME,
          rowNumber: rowIndex,
          rowData: orderedValues,
          headers: headerRow,
          status: status,
          secret: vercelSecret,
        };
        console.log(
          "Sending request to Apps Script for document generation:",
          dataToSendToAppsScript
        );
        const appsScriptResponse = await fetch(appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dataToSendToAppsScript),
        });
        if (appsScriptResponse.ok) {
          appsScriptResponseData = await appsScriptResponse.json();
          console.log("Apps Script response:", appsScriptResponseData);
        } else {
          console.error(
            "Error calling Apps Script:",
            appsScriptResponse.statusText,
            await appsScriptResponse.text()
          );
          // Consider how to handle Apps Script errors
        }
      } else {
        console.warn(
          "APPS_SCRIPT_GENERATE_DOC_URL or VERCEL_API_SECRET not configured for document generation."
        );
      }
    }

    // --- Send Email via Resend (if "Contrato") ---
    if (status === "Contrato") {
      const resendApiKey = process.env.RESEND_API_KEY;
      if (
        resendApiKey &&
        appsScriptResponseData?.pdfUrl &&
        appsScriptResponseData?.docUrl
      ) {
        const emailData = {
          to: formObject.emailMember || formObject.emailGuest, // Adjust recipient logic
          from: process.env.RESEND_EMAIL_FROM,
          subject: "Your Document is Ready!",
          html: `<p>Here are the links to your documents:</p>
                 <p><a href="${appsScriptResponseData.pdfUrl}">View PDF</a></p>
                 <p><a href="${appsScriptResponseData.docUrl}">View DOC</a></p>`,
        };
        console.log("Sending email via Resend:", emailData);
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(emailData),
        });
        const resendResult = await resendResponse.json();
        console.log("Resend API Response:", resendResult);
        if (!resendResponse.ok) {
          console.error("Error sending email via Resend:", resendResult);
          // Consider how to handle Resend API errors
        }
      } else {
        console.warn("RESEND_API_KEY not configured or document URLs missing.");
      }
    }

    return new NextResponse(
      JSON.stringify({ message: "Contract data processed successfully." }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error in Vercel POST:", error);
    return new NextResponse(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
}

function mapFormDataToWebflowFields(formData) {
  return {
    domicilioinmueblelocado: formData["domicilioInmuebleLocado"],
    ciudadinmueblelocado: formData["ciudadInmuebleLocado"],
    nombrelocadorpf1: formData["nombreLocadorPF1"],
    denominacionlegallocadorpj1: formData["denominacionLegalLocadorPJ1"],
    nombrelocatariopf1: formData["nombreLocatarioPF1"],
    denominacionlegallocatariopj1: formData["denominacionLegalLocatarioPJ1"],
    hiddeninputlocacionfechainicio: formData["hiddenInputLocacionFechaInicio"],
    hiddeninputlocacionfechatermino:
      formData["hiddenInputLocacionFechaTermino"],
    timestamp: formData["timestamp"],
    pdffile: "", // These will likely be updated later, or might not be needed in Webflow directly
    docfile: "",
    status: formData["status"],
    editlink: "", // This will be set directly in the main POST function
    contrato: formData["Contrato"],
    memberstackid: formData["MemberstackID"],
    name: formData["contractID"], // 'name' field in Webflow is set to contractID
    emailmember: formData["emailMember"],
    emailguest: formData["emailGuest"],
    // Add other mappings as needed
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
