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
  * Procesa una sección específica del documento (encabezado o pie de página)
  * reemplazando cláusulas y placeholders generales, incluyendo la lógica del logo.
  * NOTA: Esta función NO se usa para el body en esta versión, que tiene su propia lógica.
  * @param {GoogleAppsScript.Document.HeaderSection | GoogleAppsScript.Document.FooterSection} section La sección del documento.
  * @param {Array<Object>} clauses Las cláusulas obtenidas de Vercel.
  * @param {Object} placeholders El mapa de placeholders con sus valores del postData.
  * @param {Function} log La función de log.
  * @param {string} sectionName El nombre de la sección ('header', 'footer') para los logs.
  */
  function processSection(section, clauses, placeholders, log, sectionName) {
    if (!section) {
        log(`INFO: La sección '${sectionName}' es nula o indefinida. Se omite el procesamiento.`);
        return;
    }
    log(`--- Procesando sección: ${sectionName} ---`);
  
    // 1. Reemplazo de CLÁUSULAS en la sección
    log(`Iniciando reemplazo de cláusulas en ${sectionName}...`);
    clauses.forEach(({ placeholder, value, clauseText }) => {
        // Solo si el placeholder de la cláusula existe en esta sección
        if (section.findText(placeholder)) {
            if (placeholders[placeholder] === value) {
                // Si el valor coincide, reemplazamos el placeholder
                section.replaceText(placeholder, clauseText);
                log(`Cláusula "${placeholder}" con valor "${value}" reemplazada en ${sectionName}.`);
            } else {
                // Si la cláusula existe pero el valor NO coincide, eliminamos el placeholder
                section.replaceText(placeholder, '');
                log(`Cláusula "${placeholder}" no aplicada en ${sectionName} (valor no coincide). Eliminada.`);
            }
        }
    });
  
    // 2. Lógica especial para el LOGO en la sección
    // Se ejecuta DESPUÉS de que las cláusulas hayan tenido la oportunidad de insertar {{logoInmobiliaria}}
    const deseaLogoCondition = placeholders['{{deseaLogoInmobiliaria}}'];
    const logoUrl = placeholders['{{logoInmobiliaria}}'];
  
    if (deseaLogoCondition && String(deseaLogoCondition).toLowerCase() === 'si' && logoUrl) {
        log(`DEBUG: ${sectionName}: Condición para insertar logo cumplida (deseaLogo='si' y URL presente).`);
        const logoPlaceholderInThisSection = section.findText('{{logoInmobiliaria}}');
        if (logoPlaceholderInThisSection) {
            try {
                log(`DEBUG: Insertando logo en ${sectionName}. URL: "${logoUrl}".`);
                const imageBlob = UrlFetchApp.fetch(logoUrl).getBlob();
                const paragraph = logoPlaceholderInThisSection.getElement().getParent().asParagraph();
                logoPlaceholderInThisSection.getElement().removeFromParent(); // Elimina el texto del placeholder
                const image = paragraph.insertInlineImage(0, imageBlob);
                image.setWidth(140);
                image.setHeight(35);
                log(`Logo insertado con éxito en ${sectionName}.`);
            } catch (e) {
                log(`ERROR: Fallo al insertar logo en ${sectionName}: ${e}. Reemplazando '{{logoInmobiliaria}}' con mensaje de error.`);
                section.replaceText('{{logoInmobiliaria}}', 'Error al cargar imagen de logo');
            }
        } else {
            log(`WARNING: ${sectionName}: El placeholder '{{logoInmobiliaria}}' no fue encontrado en la sección después del procesamiento de cláusulas. No se pudo insertar el logo.`);
        }
    } else {
        log(`DEBUG: ${sectionName}: Condición para insertar logo NO cumplida. Asegurando eliminación de '{{logoInmobiliaria}}'.`);
        const logoPH = section.findText('{{logoInmobiliaria}}');
        if (logoPH) {
            logoPH.getElement().removeFromParent(); // Elimina el elemento del placeholder
            log(`'{{logoInmobiliaria}}' eliminado de ${sectionName} (no se insertó logo).`);
        }
    }
  
    // 3. Reemplazo de PLACEHOLDERS GENERALES restantes (incluyendo limpieza de {{deseaLogoInmobiliaria}})
    log(`Iniciando reemplazo de placeholders generales en ${sectionName}...`);
    // Re-obtener los placeholders porque el contenido de la sección pudo haber cambiado
    let allRemainingPlaceholders = section.getText().match(/{{[^{}]+}}/g) || [];
  
    for (const placeholder of allRemainingPlaceholders) {
        // Los placeholders específicos del logo o la condición ya deberían haber sido manejados o limpiados
        if (placeholder === '{{logoInmobiliaria}}' || placeholder === '{{deseaLogoInmobiliaria}}') {
            section.replaceText(placeholder, ''); // Asegura que se limpian completamente
            log(`Placeholder específico de logo o condición "${placeholder}" limpiado de ${sectionName}.`);
            continue; // Pasa al siguiente placeholder
        }
  
        // Reemplazar otros placeholders generales con sus valores
        if (placeholders[placeholder]) {
            section.replaceText(placeholder, placeholders[placeholder]);
            log(`Placeholder general "${placeholder}" reemplazado en ${sectionName}.`);
        } else {
            // Si no hay valor en el mapa de placeholders, se elimina el placeholder sin dejar espacio
            section.replaceText(placeholder, '');
            log(`Placeholder no utilizado "${placeholder}" eliminado de ${sectionName}.`);
        }
    }
    log(`Finalizado el procesamiento de ${sectionName}.`);
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
        log(`DEBUG: Valor de '{{deseaLogoInmobiliaria}}' en placeholders: "${placeholders['{{deseaLogoInmobiliaria}}']}".`);
        log(`DEBUG: Valor de '{{logoInmobiliaria}}' (URL) en placeholders: "${placeholders['{{logoInmobiliaria}}']}".`);
        
        // *** ESTE ES EL LOG CLAVE QUE NECESITAS VERIFICAR ***
        log(`DEBUG: Valor de '{{multaClausulaPenal}}' en placeholders: "${placeholders['{{multaClausulaPenal}}']}".`);
        // ***************************************************
  
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
  
  
        // --- PROCESAMIENTO ESPECÍFICO PARA EL BODY (Versión 1) ---
        log('--- Procesando sección: body (Lógica específica) ---');
  
        log('Reemplazando cláusulas en el body...');
        clauses.forEach(({ placeholder, value, clauseText }) => {
            if (placeholders[placeholder] === value) {
                body.replaceText(placeholder, clauseText);
                log(`Reemplazada cláusula para ${placeholder} con valor "${value}" en el body.`);
            }
        });
        log('Cláusulas reemplazadas en el body.');
  
        log('Manejando el logo en el body...');
        const deseaLogoBody = placeholders['{{deseaLogoInmobiliaria}}'];
        const logoUrlBody = placeholders['{{logoInmobiliaria}}'];
  
        // Solo si deseaLogo existe y es 'si' (ignorando mayúsculas/minúsculas) Y hay una URL
        if (deseaLogoBody && String(deseaLogoBody).toLowerCase() === 'si' && logoUrlBody) {
            log(`DEBUG: Evaluando '{{logoInmobiliaria}}' en el cuerpo. URL: "${logoUrlBody}"`);
            try {
                const imageBlob = UrlFetchApp.fetch(logoUrlBody).getBlob();
                let foundElement = body.findText('{{logoInmobiliaria}}');
                if (foundElement) {
                    const paragraph = foundElement.getElement().getParent().asParagraph();
                    foundElement.getElement().removeFromParent();
                    const image = paragraph.insertInlineImage(0, imageBlob);
                    image.setWidth(140);
                    image.setHeight(35);
                    log('Logo image inserted successfully in body.');
                } else {
                    log(`Warning: Placeholder '{{logoInmobiliaria}}' not found in the body for image insertion. It might have been replaced by a clause or not exist.`);
                }
            } catch (e) {
                log(`ERROR: Fallo al reemplazar '{{logoInmobiliaria}}' en el cuerpo con la imagen: ${e}. Reemplazando con mensaje de error.`);
                body.replaceText('{{logoInmobiliaria}}', 'Error al cargar imagen de logo');
            }
        } else {
            // Si el usuario NO quiere el logo o no hay URL, se elimina el placeholder de la URL
            body.replaceText('{{logoInmobiliaria}}', '');
            log(`Removed logo placeholder in body as '{{deseaLogoInmobiliaria}}' was not 'si' or no image URL was provided.`);
        }
        // Es crucial eliminar el placeholder de la condición después de haberlo usado
        body.replaceText('{{deseaLogoInmobiliaria}}', '');
        log(`Removed '{{desesaLogoInmobiliaria}}' placeholder from body after processing.`);
  
        log('Reemplazando placeholders generales en el body...');
        let allBodyPlaceholders = body.getText().match(/{{[^{}]+}}/g) || [];
        for (const placeholder of allBodyPlaceholders) {
            if (placeholders[placeholder]) {
                body.replaceText(placeholder, placeholders[placeholder]);
                log(`Reemplazado placeholder general '${placeholder}' en el body.`);
            } else {
                body.replaceText(placeholder, ''); // Reemplazar con string vacío en lugar de espacio
                log(`Eliminado placeholder no utilizado '${placeholder}' del body.`);
            }
        }
        log('Placeholders del body reemplazados.');
  
  
        // --- PROCESAMIENTO PARA HEADER Y FOOTER (Usando processSection) ---
        processSection(header, clauses, placeholders, log, 'header');
        processSection(footer, clauses, placeholders, log, 'footer');
  
  
        log('Renaming document...');
        const newName =
            'Contrato de Alquiler ' +
            (contractData['nombreLocadorPF1'] || 'Desconocido') +
            ' - ' +
            (contractData['nombreLocatarioPF1'] || 'Desconocido');
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
        let filesInRoot = DriveApp.getRootFolder().getFilesByName(DriveApp.getFileById(docId).getName());
        while (filesInRoot.hasNext()) {
            let file = filesInRoot.next();
            if (file.getId() === docId) {
                DriveApp.getRootFolder().removeFile(file);
                break;
            }
        }
        let pdfsInRoot = DriveApp.getRootFolder().getFilesByName(pdfFile.getName());
        while (pdfsInRoot.hasNext()) {
            let file = pdfsInRoot.next();
            if (file.getId() === pdfFile.getId()) {
                DriveApp.getRootFolder().removeFile(file);
                break;
            }
        }
        log('Files removed from root folder.');
  
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