// app/utils/apiUtils.js
import fetch from "node-fetch";
import { getColumnLetter } from "./helpers"; // Importa la función de helpers
import { logger } from './logger';

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
    PersonasLocador: formData["PersonasLocador"] || null,
    PersonasLocatario: formData["PersonasLocatario"] || null
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
  if (!webflowApiToken || !webflowCollectionId) {
    logger.warn('Config Webflow incompleta', contractID);
    return { success: false, error: 'Incomplete Webflow configuration' };
  }

  const itemNameFieldSlug = "name";
  const formData = {};
  headerRow.forEach((header, index) => {
    formData[header] = updatedRowValues[index];
  });

  const fieldData = mapFormDataToWebflowFields(formData);
  if (pdfUrl) fieldData.pdffile = pdfUrl;
  if (docUrl) fieldData.docfile = docUrl;

  if (editlinkColumnIndex !== -1 && rowDataToPass[editlinkColumnIndex]) {
    fieldData.editlink = rowDataToPass[editlinkColumnIndex];
  }

  let existingItem = null;
  const searchUrl = new URL(
    `https://api.webflow.com/v2/collections/${webflowCollectionId}/items`
  );
  searchUrl.searchParams.set(itemNameFieldSlug, contractID);

  try {
    const listItemsResponse = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${webflowApiToken}`,
        "accept-version": "2.0.0",
      },
    });

    const listItemsData = await listItemsResponse.json();

    if (listItemsData.items && listItemsData.items.length > 0) {
      existingItem = listItemsData.items[0];
      logger.debug('Item encontrado', contractID);
    }

    const hasValidExistingItem = existingItem && existingItem.id;
    const updateUrl = hasValidExistingItem
      ? `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/${existingItem.id}/live`
      : `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/live`;

    const method = hasValidExistingItem ? "PATCH" : "POST";
    const requestBody = method === "POST" 
      ? { fieldData: fieldData }
      : { fieldData: fieldData, isArchived: false, isDraft: false };

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

    if (!webflowResponse.ok) {
      // Si el error es porque el item está en queue, intentamos actualizarlo en draft
      if (webflowResult.code === 'ITEM_IN_QUEUE' && hasValidExistingItem) {
        const draftUpdateUrl = `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/${existingItem.id}`;
        const draftResponse = await fetch(draftUpdateUrl, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${webflowApiToken}`,
            "accept-version": "2.0.0",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        const draftResult = await draftResponse.json();
        if (!draftResponse.ok) {
          logger.error('Error API Webflow (draft)', contractID);
          return { 
            success: false, 
            error: 'Webflow API error (draft)', 
            details: draftResult 
          };
        }

        // Publicar el item después de actualizarlo en draft
        const publishUrl = `https://api.webflow.com/v2/collections/${webflowCollectionId}/items/${existingItem.id}/publish`;
        const publishResponse = await fetch(publishUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${webflowApiToken}`,
            "accept-version": "2.0.0",
            "Content-Type": "application/json",
          },
        });

        if (!publishResponse.ok) {
          logger.error('Error publicando item en Webflow', contractID);
          return { 
            success: false, 
            error: 'Webflow publish error', 
            details: await publishResponse.json() 
          };
        }

        return { 
          success: true, 
          data: draftResult 
        };
      }

      logger.error('Error API Webflow', contractID);
      return { 
        success: false, 
        error: 'Webflow API error', 
        details: webflowResult 
      };
    }

    return { 
      success: true, 
      data: webflowResult 
    };
  } catch (error) {
    logger.error(`Error en interacción con Webflow: ${error.message}`, contractID);
    return { 
      success: false, 
      error: 'Webflow interaction error', 
      details: error.message 
    };
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
    logger.warn('URLs faltantes');
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
    "https://inmoacuerdos-vercel-server.vercel.app/api/Resend/email-one-time-purchase";

  const sendSingleEmail = async (toEmail) => {
    if (!toEmail) {
      logger.warn('Email vacío');
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

    try {
      const response = await fetch(vercelApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (response.ok) {
        logger.info('Email enviado', toEmail);
      } else {
        logger.error(`Error email: ${response.status}`, toEmail);
      }
    } catch (error) {
      logger.error(`Error email: ${error.message}`, toEmail);
    }
  };

  if (toEmailMember) {
    await sendSingleEmail(toEmailMember);
  }
  if (toEmailGuest) {
    await sendSingleEmail(toEmailGuest);
  }
}
