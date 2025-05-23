// app/utils/apiUtils.js
import fetch from "node-fetch";
import { getColumnLetter } from "./helpers"; // Importa la función de helpers

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

  if (editlinkColumnIndex !== -1 && rowDataToPass[editlinkColumnIndex]) {
    fieldData.editlink = rowDataToPass[editlinkColumnIndex];
  }

  let existingItem = null;

  if (!existingItem) {
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
  const updateUrl = hasValidExistingItem
    ? `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/${existingItem.id}/live`
    : `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/live`;
  const method = hasValidExistingItem ? "PATCH" : "POST";
  const requestBody = {
    fieldData: fieldData,
    ...(method === "PATCH" && { isArchived: false, isDraft: false }),
  };

  console.log(`Webflow ${method} Request Body:`, JSON.stringify(requestBody));

  const webflowResponse = await fetch(updateUrl, {
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
    webflowResult.id &&
    webflowItemIdColumnIndex !== -1
  ) {
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
}

export async function sendEmailNotification(
  toEmailMember,
  toEmailGuest,
  pdfUrl,
  docUrl,
  updatedRowValues,
  headerRow
) {
  if (!pdfUrl || !docUrl) {
    console.warn("Document URLs missing. Skipping email sending.");
    return;
  }

  const nombreCliente =
    updatedRowValues[headerRow.indexOf("nombreLocatarioPF1")] ||
    "Estimado/a usuario";
  let subject = "Tu Contrato de LocaciÃ³n de vivienda estÃ¡ listo - ";
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
  const contractTypeDescription = "Contrato de LocaciÃ³n de vivienda";
  const vercelApiUrl =
    "https://inmoacuerdos-vercel-server.vercel.app/api/Resend/email-one-time-purchase"; // Asegúrate de que esta URL sea correcta

  const sendSingleEmail = async (toEmail) => {
    if (!toEmail) return;

    const payload = {
      to: toEmail,
      subject: subject,
      name: nombreCliente,
      linkPDF: pdfUrl,
      linkDOC: docUrl,
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
      const responseText = await response.text();
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
      console.error(`Error sending email to ${toEmail} via Vercel:`, error);
    }
  };

  await sendSingleEmail(toEmailMember);
  await sendSingleEmail(toEmailGuest);
}
