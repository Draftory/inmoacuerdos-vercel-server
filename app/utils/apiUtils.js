// app/utils/apiUtils.js
import fetch from "node-fetch";
import { getColumnLetter } from "./helpers"; // Importa la función de helpers

/**
 * Maps form data from Google Sheet to Webflow field slugs.
 * Ensures that the property names match the slugs in your Webflow collection.
 * @param {Object} formData - Object containing data from the Google Sheet row.
 * @returns {Object} Object with data mapped to Webflow field slugs.
 */
export function mapFormDataToWebflowFields(formData) {
  return {
    editlink: formData["Editlink"] || null,
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
    pdffile: formData["PDFFile"] || null,
    docfile: formData["DOCFile"] || null,
    hiddeninputlocacionfechainicio:
      formData["hiddenInputLocacionFechaInicio"] || null,
    hiddeninputlocacionfechatermino:
      formData["hiddenInputLocacionFechaTermino"] || null,
  };
}

/**
 * Interacts with the Webflow API to create or update an item.
 * @param {string} contractID - The contract ID to search/use as name.
 * @param {string} webflowApiToken - Webflow API authentication token.
 * @param {string} webflowCollectionId - ID of the Webflow collection.
 * @param {Array<string>} headerRow - Array of column headers from Google Sheet.
 * @param {Array<string>} updatedRowValues - Array of updated row data from Google Sheet.
 * @param {string} pdfUrl - URL of the generated PDF document.
 * @param {string} docUrl - URL of the generated DOC document.
 * @param {Array<string>} rowDataToPass - Original row data from Google Sheet.
 * @param {Object} sheets - Google Sheets API client.
 * @param {string} spreadsheetId - ID of the Google Spreadsheet.
 * @param {string} sheetName - Name of the sheet in the Google Spreadsheet.
 * @param {number} rowIndex - 1-based row index in Google Sheet.
 * @param {number} editlinkColumnIndex - Index of the 'Editlink' column in Google Sheet.
 */
export async function interactWithWebflow(
  contractID,
  webflowApiToken,
  webflowCollectionId,
  headerRow,
  updatedRowValues,
  pdfUrl,
  docUrl,
  rowDataToPass,
  sheets,
  spreadsheetId,
  sheetName,
  rowIndex,
  editlinkColumnIndex
) {
  if (!webflowApiToken || !webflowCollectionId || !pdfUrl || !docUrl) {
    console.warn(
      "Webflow API token, collection ID, or document URLs missing. Skipping Webflow update."
    );
    return;
  }

  const itemNameFieldSlug = "name";

  const formData = {};
  headerRow.forEach((header, index) => {
    formData[header] = updatedRowValues[index];
  });

  const fieldData = mapFormDataToWebflowFields(formData);
  fieldData.pdffile = pdfUrl;
  fieldData.docfile = docUrl;

  // Assign editlink directly from rowDataToPass (original data)
  if (editlinkColumnIndex !== -1 && rowDataToPass[editlinkColumnIndex]) {
    fieldData.editlink = rowDataToPass[editlinkColumnIndex];
  }

  let existingItem = null;

  // Attempt to search by name (contractID)
  console.log(
    `Webflow item not found by ID from sheet (skipped), attempting to search by name: ${contractID}`
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
  console.log("Webflow search response status:", listItemsResponse.status);
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

  console.log(`Webflow ${method} Request Body:`, JSON.stringify(requestBody));

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
  } else if (
    method === "POST" &&
    webflowResult.id
    // No longer checking webflowItemIdColumnIndex !== -1 here
  ) {
    // This part will only execute if method is POST and webflowResult.id exists
    // We are no longer updating WebflowItemID in Google Sheets from here
    console.log(
      "Webflow item created, but Google Sheets will not be updated with Webflow Item ID from this function."
    );
  }
}

/**
 * Sends email notifications using a custom Vercel endpoint.
 * @param {string} toEmailMember - Email address of the member.
 * @param {string} toEmailGuest - Email address of the guest.
 * @param {string} pdfUrl - URL of the generated PDF document.
 * @param {string} docUrl - URL of the generated DOC document.
 * @param {Array<string>} updatedRowValues - Array of updated row data from Google Sheet.
 * @param {Array<string>} headerRow - Array of column headers from Google Sheet.
 */
export async function sendEmailNotification(
  toEmailMember,
  toEmailGuest,
  pdfUrl,
  docUrl,
  updatedRowValues,
  headerRow
) {
  if (!pdfUrl || !docUrl) {
    console.warn("[Email] Document URLs missing. Skipping email sending.");
    return;
  }

  const nombreCliente =
    updatedRowValues[headerRow.indexOf("nombreLocatarioPF1")] ||
    "Estimado/a usuario";
  let subject = "Tu Contrato de Locación de vivienda está listo - ";
  let locadorInfo = "Locador Desconocido";
  let locatarioInfo = "Locatario Desconocido";

  const nombreLocadorPF1Index = headerRow.indexOf("nombreLocadorPF1");
  const denominacionLegalLocadorPJ1Index = headerRow.indexOf(
    "denominacionLegalLocadorPJ1"
  );
  const nombreLocatarioPF1Index = headerRow.indexOf("nombreLocatarioPF1");
  const denominacionLegalLocatarioPJ1Index = headerRow.indexOf(
    "denominacionLegalLocatarioPJ1"
  );

  if (nombreLocadorPF1Index !== -1) {
    locadorInfo = updatedRowValues[nombreLocadorPF1Index] || "";
  }
  if (denominacionLegalLocadorPJ1Index !== -1 && !locadorInfo) {
    locadorInfo = updatedRowValues[denominacionLegalLocadorPJ1Index] || "";
  }

  if (nombreLocatarioPF1Index !== -1) {
    locatarioInfo = updatedRowValues[nombreLocatarioPF1Index] || "";
  }
  if (denominacionLegalLocatarioPJ1Index !== -1 && !locatarioInfo) {
    locatarioInfo = updatedRowValues[denominacionLegalLocatarioPJ1Index] || "";
  }

  subject += `${locadorInfo} - ${locatarioInfo}`;
  const contractTypeDescription = "Contrato de Locación de vivienda";
  const vercelApiUrl =
    "https://inmoacuerdos-vercel-server.vercel.app/api/Resend/email-one-time-purchase"; // Asegúrate de que esta URL sea correcta

  const sendSingleEmail = async (toEmail) => {
    if (!toEmail) {
      console.warn(`[Email] Skipping email to empty recipient.`);
      return;
    }

    const payload = {
      to: toEmail,
      subject: subject,
      name: nombreCliente,
      linkPDF: pdfUrl,
      linkDOC: docUrl,
      contractTypeDescription: contractTypeDescription,
    };

    console.log(
      `[Email] Sending email to ${toEmail} via custom Vercel endpoint:`,
      JSON.stringify(payload, null, 2)
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
          `[Email] Email sent to ${toEmail} via Vercel. Response: ${responseText}`
        );
      } else {
        console.error(
          `[Email] Error sending email to ${toEmail} via Vercel. Status: ${response.status}, Response: ${responseText}`
        );
      }
    } catch (error) {
      console.error(
        `[Email] Error sending email to ${toEmail} via Vercel:`,
        error
      );
    }
  };

  console.log(`[Email] Attempting to send email to Member: ${toEmailMember}`);
  await sendSingleEmail(toEmailMember);
  console.log(`[Email] Attempting to send email to Guest: ${toEmailGuest}`);
  await sendSingleEmail(toEmailGuest);
}
