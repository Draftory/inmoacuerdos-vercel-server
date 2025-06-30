/**
 * Fetches clauses from a Vercel API endpoint.
 * This function is designed to retrieve dynamic clauses for document generation.
 * @returns {Array<Object>} An array of clause objects, each with placeholder, value, and clauseText.
 */
function fetchClausesFromVercel() {
  const CLAUSES_URL = 'https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-get-clauses';
  Logger.log('fetchClausesFromVercel: Iniciando petición...');
  try {
      const response = UrlFetchApp.fetch(CLAUSES_URL);
      Logger.log('fetchClausesFromVercel: Respuesta recibida. Código de estado: ' + response.getResponseCode());
      const clausesResponse = JSON.parse(response.getContentText());
      Logger.log('fetchClausesFromVercel: Respuesta JSON parseada: ' + JSON.stringify(clausesResponse));

      // Validamos que la respuesta tenga la estructura esperada: un array 'values'.
      if (!clausesResponse || !Array.isArray(clausesResponse.values)) {
          Logger.log('fetchClausesFromVercel: Error - Formato de datos inválido recibido de Vercel. Se esperaba un array en "values".');
          return [];
      }

      // Mapeamos directamente los elementos de 'values' ya que la estructura es directa.
      const clauses = clausesResponse.values.map(item => {
          const clauseObject = {
              placeholder: `{{${item[0]}}}`, // El primer elemento es el nombre del placeholder (ej. "PersonasLocador")
              value: item[1] || '',           // El segundo elemento es el valor que activa esta cláusula (ej. "1PLocador")
              clauseText: item[2] || ''       // El tercer elemento es el texto real de la cláusula
          };
          Logger.log('fetchClausesFromVercel: Cláusula procesada: ' + JSON.stringify(clauseObject));
          return clauseObject;
      });
      Logger.log('fetchClausesFromVercel: Cláusulas obtenidas: ' + JSON.stringify(clauses));
      return clauses;
  } catch (error) {
      Logger.log('fetchClausesFromVercel: Error - ' + error);
      return [];
  }
}

/**
* Handles POST requests to the Apps Script web app.
* This function is the entry point for external systems (like Vercel) to trigger document generation.
* @param {Object} e The event object containing the POST data.
* @returns {GoogleAppsScript.Content.TextOutput} A JSON response indicating success or failure.
*/
function doPost(e) {
  const logMessages = []; // Este array capturará todos los mensajes de log
  const log = (message) => {
      logMessages.push(message); // Agrega el mensaje al array
      Logger.log(message);      // Y también lo envía a los logs de Apps Script (si pudieras verlos)
  };

  log("doPost function executed for document generation.");

  try {
      const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
      const requiredProperties = [
          'TEMPLATE_ID',
          'DESTINATION_FOLDER_ID',
          'VERCEL_API_SECRET'
      ];

      const missingProperties = requiredProperties.filter(prop => !SCRIPT_PROPERTIES.getProperty(prop));
      if (missingProperties.length > 0) {
          log(`Error: Missing required script properties: ${missingProperties.join(', ')}`);
          return ContentService.createTextOutput(JSON.stringify({
              "error": `Missing required script properties: ${missingProperties.join(', ')}`,
              "logs": logMessages
          })).setMimeType(ContentService.MimeType.JSON);
      }

      log("Script properties validated successfully");

      const VERCEL_API_SECRET = SCRIPT_PROPERTIES.getProperty('VERCEL_API_SECRET');
      if (!VERCEL_API_SECRET) {
          log("Error: VERCEL_API_SECRET not configured in Apps Script.");
          return ContentService.createTextOutput(JSON.stringify({
              "error": "Unauthorized",
              "logs": logMessages
          })).setMimeType(ContentService.MimeType.JSON);
      }

      if (!e || !e.postData || !e.postData.contents) {
          log("Error: No post data received.");
          return ContentService.createTextOutput(JSON.stringify({
              "error": "No post data received.",
              "logs": logMessages
          })).setMimeType(ContentService.MimeType.JSON);
      }

      const postData = e.postData.contents;
      log(`Received post data: ${postData}`);

      const requestData = JSON.parse(postData);
      const { contractData, headers, secret } = requestData;

      if (!contractData || !headers || !Array.isArray(headers)) {
          log("Error: Invalid data format received from Vercel.");
          return ContentService.createTextOutput(JSON.stringify({
              "error": "Invalid data format received from Vercel.",
              "logs": logMessages
          })).setMimeType(ContentService.MimeType.JSON);
      }
      log(`Processing request for contract ID: ${contractData.contractID}`);

      if (secret !== VERCEL_API_SECRET) {
          log(`Error: Invalid secret received: ${secret}`);
          return ContentService.createTextOutput(JSON.stringify({
              "error": "Unauthorized",
              "logs": logMessages
          })).setMimeType(ContentService.MimeType.JSON);
      }

      log(`Generating documents for contract ID: ${contractData.contractID}`);
      const documentLinks = generateDocuments(contractData, headers, logMessages);

      log(`Document generation completed. PDF URL: ${documentLinks.pdfUrl}, DOC URL: ${documentLinks.docUrl}`);

      if (documentLinks.error) {
          log(`Error during document generation: ${documentLinks.error}`);
          return ContentService.createTextOutput(JSON.stringify({
              "error": documentLinks.error,
              "logs": logMessages
          })).setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService.createTextOutput(JSON.stringify({
          "pdfUrl": documentLinks.pdfUrl,
          "docUrl": documentLinks.docUrl,
          "logs": logMessages
      })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
      log(`Error in doPost: ${error}`);
      return ContentService.createTextOutput(JSON.stringify({
          "error": error.toString(),
          "logs": logMessages
      })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Processes a specific section of the document (body, header, or footer)
 * replacing clauses and general placeholders, including logo logic.
 * This function is designed to properly handle nested clauses and prevent overwrites.
 * @param {GoogleAppsScript.Document.HeaderSection | GoogleAppsScript.Document.FooterSection | GoogleAppsScript.Document.Body} section The document section.
 * @param {Array<Object>} clauses The clauses obtained from Vercel.
 * @param {Object} placeholders The map of placeholders with their values from the postData.
 * @param {Function} log The logging function.
 * @param {string} sectionName The name of the section ('body', 'header', 'footer') for logging.
 */
function processSection(section, clauses, placeholders, log, sectionName) {
  if (!section) {
      log(`INFO: The section '${sectionName}' is null or undefined. Skipping processing.`);
      return;
  }
  log(`--- Processing section: ${sectionName} ---`);

  // --- 1. CLAUSE REPLACEMENT (Iterative for nested clauses) ---
  log(`Initiating iterative clause replacement in ${sectionName}...`);

  // Group clauses by their placeholder name for efficient lookup
  const clausesByPlaceholder = {};
  clauses.forEach(clause => {
      if (!clausesByPlaceholder[clause.placeholder]) {
          clausesByPlaceholder[clause.placeholder] = [];
      }
      clausesByPlaceholder[clause.placeholder].push(clause);
  });

  let changesMadeInIteration = true;
  let iterationCount = 0;
  const MAX_CLAUSE_ITERATIONS = 10; // Prevent infinite loops for circular references

  while (changesMadeInIteration && iterationCount < MAX_CLAUSE_ITERATIONS) {
      changesMadeInIteration = false;
      iterationCount++;
      log(`DEBUG: Clause replacement iteration ${iterationCount} for ${sectionName}...`);

      let docText = section.getText();
      // Find ALL placeholders in the current document text that might be clauses
      // We need to re-scan in each iteration because previous replacements might have inserted new clause-placeholders.
      let currentDocPlaceholders = docText.match(/{{[^{}]+}}/g) || [];
      currentDocPlaceholders = [...new Set(currentDocPlaceholders)]; // Get unique ones

      for (const p of currentDocPlaceholders) {
          // If this placeholder 'p' is known to be a clause placeholder
          if (clausesByPlaceholder[p]) {
              const relatedClauses = clausesByPlaceholder[p];
              const placeholderValue = placeholders[p];

              let chosenClauseText = null; // Use null to indicate no match found yet
              
              for (const clause of relatedClauses) {
                  if (placeholderValue === clause.value) {
                      chosenClauseText = clause.clauseText;
                      log(`DEBUG: In iteration ${iterationCount}, selected clause for "${p}": input value "${placeholderValue}" matches clause value "${clause.value}". Text to use: "${chosenClauseText.substring(0, Math.min(chosenClauseText.length, 100))}..."`);
                      break; // Found the matching clause for this placeholder
                  }
              }

              // Only replace if a specific clause was chosen or if it should be explicitly removed (chosenClauseText === '')
              if (chosenClauseText !== null) { // If a matching clause was found (or if it should be empty string)
                  if (section.replaceText(p, chosenClauseText)) {
                      changesMadeInIteration = true; // Mark that a change was made
                      log(`Clause "${p}" replaced successfully in ${sectionName} during iteration ${iterationCount}.`);
                  } else {
                      log(`WARNING: In iteration ${iterationCount}, placeholder "${p}" not found for clause replacement (already replaced or not existing).`);
                  }
              } else {
                  // If 'p' is a clause placeholder but its input value didn't match any specific clause.
                  // It should be removed, otherwise, it would be treated as a general placeholder later.
                  if (section.replaceText(p, '')) {
                      changesMadeInIteration = true;
                      log(`Placeholder "${p}" had no matching clause in iteration ${iterationCount}; it was removed from ${sectionName}.`);
                  } else {
                     log(`WARNING: In iteration ${iterationCount}, placeholder "${p}" not found for removal (already removed or not existing).`);
                  }
              }
          }
      }
      if (!changesMadeInIteration && iterationCount > 1) {
          log(`DEBUG: No further clause changes detected in iteration ${iterationCount}. Exiting clause loop.`);
      } else if (iterationCount === MAX_CLAUSE_ITERATIONS) {
          log(`WARNING: Max clause replacement iterations (${MAX_CLAUSE_ITERATIONS}) reached for ${sectionName}. There might be unreplaced nested clauses or circular references.`);
      }
  }
  log(`Finished iterative clause replacement in ${sectionName}. Total iterations: ${iterationCount}.`);


  // --- 2. LOGO HANDLING (Specific logic, after all clause expansions) ---
  const deseaLogoCondition = placeholders['{{deseaLogoInmobiliaria}}'];
  const logoUrl = placeholders['{{logoInmobiliaria}}'];

  if (deseaLogoCondition && String(deseaLogoCondition).toLowerCase() === 'si' && logoUrl) {
      log(`DEBUG: ${sectionName}: Condition for logo insertion met (deseaLogo='si' and URL present).`);
      let logoPlaceholderInThisPart = section.findText('{{logoInmobiliaria}}');
      if (logoPlaceholderInThisPart) {
          try {
              log(`DEBUG: Inserting logo in ${sectionName}. URL: "${logoUrl}".`);
              const imageBlob = UrlFetchApp.fetch(logoUrl).getBlob();
              const paragraph = logoPlaceholderInThisPart.getElement().getParent().asParagraph();
              logoPlaceholderInThisPart.getElement().removeFromParent(); // Remove text placeholder
              const image = paragraph.insertInlineImage(0, imageBlob);
              image.setWidth(140); // Adjust as needed
              image.setHeight(35); // Adjust as needed
              log(`Logo inserted successfully in ${sectionName}.`);
          } catch (e) {
              log(`ERROR: Failed to insert logo in ${sectionName}: ${e}. Replacing '{{logoInmobiliaria}}' with error message.`);
              section.replaceText('{{logoInmobiliaria}}', 'Error al cargar imagen de logo'); // Fallback error message
          }
      } else {
          log(`WARNING: ${sectionName}: The placeholder '{{logoInmobiliaria}}' was not found in the section after clause processing. Logo could not be inserted.`);
      }
  } else {
      log(`DEBUG: ${sectionName}: Condition for logo insertion NOT met. Ensuring '{{logoInmobiliaria}}' is removed.`);
      // Ensure the placeholder is removed if conditions aren't met
      section.replaceText('{{logoInmobiliaria}}', '');
      log(`'{{logoInmobiliaria}}' removed from ${sectionName} (no logo inserted).`);
  }
  // Always remove the condition placeholder itself
  section.replaceText('{{deseaLogoInmobiliaria}}', '');
  log(`'{{deseaLogoInmobiliaria}}' removed from ${sectionName}.`);


  // --- 3. GENERAL PLACEHOLDER REPLACEMENT (for any remaining placeholders) ---
  log(`Initiating general placeholder replacement in ${sectionName}...`);
  // Re-scan the document text as content might have changed due to clauses/logo
  let allRemainingPlaceholders = section.getText().match(/{{[^{}]+}}/g) || [];
  allRemainingPlaceholders = [...new Set(allRemainingPlaceholders)]; // Ensure unique placeholders

  for (const p of allRemainingPlaceholders) {
      // Exclude logo-specific placeholders as they should already be handled
      if (p === '{{logoInmobiliaria}}' || p === '{{deseaLogoInmobiliaria}}') {
          // Double-check they are completely removed, though they should be by step 2
          section.replaceText(p, '');
          log(`DEBUG: Explicitly ensured '${p}' was removed from ${sectionName}.`);
          continue; // Skip to next placeholder
      }

      if (placeholders[p]) { // If the placeholder has a value in the input data
          section.replaceText(p, placeholders[p]);
          log(`General placeholder "${p}" replaced in ${sectionName}.`);
      } else { // If the placeholder has no corresponding value in the input data
          section.replaceText(p, ''); // Remove it
          log(`Unused placeholder "${p}" removed from ${sectionName}.`);
      }
  }
  log(`Finished processing ${sectionName}.`);
}


/**
 * Generates a Google Docs document from a template, replacing placeholders and clauses.
 * It also handles the conditional insertion of the real estate agency logo.
 * @param {Object} contractData The data to populate the document (e.g., contract details, logo URL).
 * @param {Array<string>} headers An array of placeholder names to map to contractData.
 * @param {Array<string>} sharedLogMessages An array to push log messages into, for external visibility.
 * @returns {Object} An object containing the URLs of the generated PDF and DOC files, and logs.
 */
function generateDocuments(contractData, headers, sharedLogMessages) {
  const log = (message) => {
      sharedLogMessages.push(message);
      Logger.log(message);
  };

  log('generateDocuments: Starting for contract ID ' + contractData.contractID);
  let pdfDownloadUrl;
  let docDownloadUrl;

  try {
      log('Fetching clauses...');
      const clauses = fetchClausesFromVercel();
      log(`Fetched ${clauses.length} clauses.`);

      const placeholders = {};
      headers.forEach((header) => {
          const key = `{{${header}}}`;
          const value = contractData[header];
          if (key && value !== undefined && value !== null) {
              placeholders[key] = value;
          }
      });
      log(`Created placeholders map with ${Object.keys(placeholders).length} entries.`);
      log(`DEBUG: Valor de '{{deseaLogoInmobiliaria}}' en placeholders: "${placeholders['{{deseaLogoInmobiliaria']}}".`);
      log(`DEBUG: Valor de '{{logoInmobiliaria}}' (URL) en placeholders: "${placeholders['{{logoInmobiliaria']}}".`);
      
      // This log is still useful for your own verification
      log(`DEBUG: Valor de '{{multaClausulaPenal}}' en placeholders: "${placeholders['{{multaClausulaPenal']}}".`);

      log('Creating document copy...');
      const TEMPLATE_ID = PropertiesService.getScriptProperties().getProperty('TEMPLATE_ID');
      if (!TEMPLATE_ID) {
          throw new Error('TEMPLATE_ID not found in script properties');
      }
      log(`Using template ID: ${TEMPLATE_ID}.`);

      const docCopy = DriveApp.getFileById(TEMPLATE_ID).makeCopy();
      const docId = docCopy.getId();
      log(`Created document copy with ID: ${docId}.`);

      const doc = DocumentApp.openById(docId);
      const body = doc.getBody();
      const header = doc.getHeader();
      const footer = doc.getFooter();

      log('Opened document, header, and footer.');

      // Use the unified processSection function for ALL document parts
      // This function contains the robust logic for handling clauses, logo, and general placeholders.
      processSection(body, clauses, placeholders, log, 'body');
      processSection(header, clauses, placeholders, log, 'header');
      processSection(footer, clauses, placeholders, log, 'footer');

      log('Renaming document...');

      // --- Start of Naming Logic Modification for "y otros" ---
      // Determine Locador Name for document title
      let locadorNameForTitle = 'Desconocido';
      if (placeholders['{{locadorPersona1}}'] === 'locadorPF1') {
          locadorNameForTitle = placeholders['{{nombreLocadorPF1}}'] || 'Desconocido';
      } else if (placeholders['{{locadorPersona1}}'] === 'locadorPJ1') {
          locadorNameForTitle = placeholders['{{denominacionLegalLocadorPJ1}}'] || 'Desconocido';
      }

      // Check for multiple Locadors
      const personasLocadorCount = placeholders['{{PersonasLocador}}']; // This holds "1PLocador", "2PLocador", etc.
      if (personasLocadorCount && (personasLocadorCount === '2PLocador' || personasLocadorCount === '3PLocador')) {
          if (locadorNameForTitle !== 'Desconocido') { // Only append if we actually found a name
              locadorNameForTitle += ' y otros';
          } else {
              locadorNameForTitle = 'Locadores y otros'; // Fallback if no specific name found
          }
      }

      // Determine Locatario Name for document title
      let locatarioNameForTitle = 'Desconocido';
      if (placeholders['{{locatarioPersona1}}'] === 'locatarioPF1') {
          locatarioNameForTitle = placeholders['{{nombreLocatarioPF1}}'] || 'Desconocido';
      } else if (placeholders['{{locatarioPersona1}}'] === 'locatarioPJ1') {
          locatarioNameForTitle = placeholders['{{denominacionLegalLocatarioPJ1}}'] || 'Desconocido';
      }

      // Check for multiple Locatarios
      const personasLocatarioCount = placeholders['{{PersonasLocatario}}']; // This holds "1PLocatario", "2PLocatario", etc.
      if (personasLocatarioCount && (personasLocatarioCount === '2PLocatario' || personasLocatarioCount === '3PLocatario')) {
          if (locatarioNameForTitle !== 'Desconocido') { // Only append if we actually found a name
              locatarioNameForTitle += ' y otros';
          } else {
              locatarioNameForTitle = 'Locatarios y otros'; // Fallback if no specific name found
          }
      }
      
      const newName =
          'Contrato de Alquiler ' +
          locadorNameForTitle +
          ' - ' +
          locatarioNameForTitle;
      // --- End of Naming Logic Modification for "y otros" ---

      DriveApp.getFileById(docId).setName(newName);
      log(`Document renamed to: ${newName}.`);

      log('Saving and closing document...');
      doc.saveAndClose();
      log('Document saved and closed.');

      log('Converting to PDF...');
      const pdfBlob = DriveApp.getFileById(docId).getAs('application/pdf');
      const pdfFileName = newName + '.pdf';
      const pdfFile = DriveApp.createFile(pdfBlob.setName(pdfFileName));
      log(`PDF created with ID: ${pdfFile.getId()}.`);

      log('Moving files to destination folder...');
      const DESTINATION_FOLDER_ID = PropertiesService.getScriptProperties().getProperty('DESTINATION_FOLDER_ID');
      if (!DESTINATION_FOLDER_ID) {
          throw new Error('DESTINATION_FOLDER_ID not found in script properties');
      }
      log(`Using destination folder ID: ${DESTINATION_FOLDER_ID}.`);

      const destinationFolder = DriveApp.getFolderById(DESTINATION_FOLDER_ID);
      destinationFolder.addFile(DriveApp.getFileById(docId));
      destinationFolder.addFile(pdfFile);
      log('Files moved to destination folder.');

      log('Removing files from root folder...');
      const rootFolder = DriveApp.getRootFolder();
      try {
          // Check if file is in root before attempting to remove
          // (Files moved to another folder are automatically removed from root if they were there)
          // This block is mostly for explicit logging or if the move failed.
          const docFile = DriveApp.getFileById(docId);
          if (docFile.getParents().hasNext() && docFile.getParents().next().getId() === rootFolder.getId()) {
              rootFolder.removeFile(docFile);
              log('Original document removed from root folder.');
          } else {
              log('Original document not found in root or already moved.');
          }
      } catch (e) {
          log(`WARNING: Error removing document from root: ${e.message}`);
      }
      try {
          const pdfFinalFile = DriveApp.getFileById(pdfFile.getId());
           if (pdfFinalFile.getParents().hasNext() && pdfFinalFile.getParents().next().getId() === rootFolder.getId()) {
              rootFolder.removeFile(pdfFinalFile);
              log('PDF document removed from root folder.');
          } else {
              log('PDF document not found in root or already moved.');
          }
      } catch (e) {
          log(`WARNING: Error removing PDF from root: ${e.message}`);
      }
      log('Files removal attempt from root folder completed.');

      log('Generating download links...');
      docDownloadUrl = `https://docs.google.com/document/d/${docId}/export?format=docx`;
      pdfDownloadUrl = `https://drive.google.com/u/0/uc?id=${pdfFile.getId()}&export=download`;
      log(`DOC download link: ${docDownloadUrl}.`);
      log(`PDF download link: ${pdfDownloadUrl}.`);

      log('generateDocuments: Completed successfully.');
      return {
          pdfUrl: pdfDownloadUrl,
          docUrl: docDownloadUrl,
          logs: sharedLogMessages
      };

  } catch (error) {
      log(`ERROR: Error in generateDocuments: ${error}.`);
      return {
          pdfUrl: undefined,
          docUrl: undefined,
          error: error.toString(),
          logs: sharedLogMessages
      };
  }
}