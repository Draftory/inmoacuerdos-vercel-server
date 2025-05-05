import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import Airtable from 'airtable';

/* Variables de entorno para Google */
const GOOGLE_APPLICATION_CREDENTIALS_SECRET = process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;
const TEMPLATE_ID = process.env.ARG_LOCACION_DE_VIVIENDA_TEMPLATE_ID;
const DESTINATION_FOLDER_ID = process.env.GOOGLE_DRIVE_DESTINATION_FOLDER_ID;

/* Variables de entorno para Airtable */
const AIRTABLE_PERSONAL_ACCESS_TOKEN = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
const AIRTABLE_BASE_ID_CONTRACT_DATABASE = process.env.AIRTABLE_BASE_ID_CONTRACT_DATABASE;
const AIRTABLE_CONTRACTS_TABLE_NAME = 'Contratos';
const AIRTABLE_STORAGE_TABLE_NAME = 'Documentos';

/* Variables de entorno para Webflow */
const WEBFLOW_API_TOKEN = process.env.WEBFLOW_API_TOKEN;
const WEBFLOW_USER_COLLECTION_ID = process.env.WEBFLOW_USER_COLLECTION_ID;

const allowedOrigins = [
  'https://www.inmoacuerdos.com',
  'https://inmoacuerdos.webflow.io',
];

export async function OPTIONS(req) {
  const origin = req.headers.get('origin');
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  return new NextResponse(null, {
    status: 204,
    headers: headers,
  });
}

/* Función para obtener los datos del registro desde Airtable */
async function getRowDataFromAirtable(recordId: string) {
  const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID_CONTRACT_DATABASE);
  try {
    const record = await base(AIRTABLE_CONTRACTS_TABLE_NAME).find(recordId);
    if (!record) {
      throw new Error(`No se encontró el registro con ID ${recordId} en Airtable.`);
    }
    return record;
  } catch (error: any) {
    console.error(`Error al obtener los datos del registro ${recordId} de Airtable:`, error);
    throw new Error(`Error al obtener los datos del registro ${recordId}: ${error.message}`);
  }
}

/* Función para obtener las cláusulas desde Airtable */
async function fetchClausesFromAirtable() {
  const Airtable = require('airtable');
  const airtablePersonalAccessToken = process.env.AIRTABLE_PERSONAL_ACCESS_TOKEN;
  const airtableBaseId = process.env.AIRTABLE_BASE_ID_CLAUSES;
  const airtableTableName = process.env.AIRTABLE_TABLE_NAME || 'Clausulas-locacion-vivienda';

  if (!airtablePersonalAccessToken) {
    throw new Error('AIRTABLE_PERSONAL_ACCESS_TOKEN is not set');
  }
  if (!airtableBaseId) {
    throw new Error('AIRTABLE_BASE_ID_CLAUSES is not set');
  }

  const base = new Airtable({ apiKey: airtablePersonalAccessToken }).base(airtableBaseId);

  try {
    const records = await base(airtableTableName).select().all();
    const clauses = records.map(record => ({
      placeholder: `{{${record.fields.Nombre}}}`,
      value: record.fields.Valor,
      clauseText: record.fields.Texto,
    }));
    return clauses;
  } catch (error) {
    console.error('Error fetching clauses from Airtable:', error);
    throw error;
  }
}

async function generateDocuments(rowData: any, auth: any) {
  const docs = google.docs({ version: 'v1', auth });
  const drive = google.drive({ version: 'v3', auth });

  try {
    const clauses = await fetchClausesFromAirtable();
    const placeholders: { [key: string]: string } = {};
    const headers = Object.keys(rowData.fields);

    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      const value = rowData.fields[key] || '';
      if (key) {
        placeholders[`{{${key}}}`] = value;
      }
    }

    const copyResponse = await drive.files.copy({
      fileId: TEMPLATE_ID,
      requestBody: {
        name: 'Documento Copiado',
      },
    });
    const docId = copyResponse.data.id;
    if (!docId) {
      throw new Error('Failed to copy the template document.');
    }

    const document = await docs.documents.get({ documentId: docId });
    const body = document.data.body;
    if (!body) {
      throw new Error("Document body is null");
    }
    let content = body.content || [];

    const replaceContent = async (content: any[]) => {
      for (let element of content) {
        if (element.paragraph) {
          let runs = element.paragraph.runs || [];
          for (let run of runs) {
            if (run.text) {
              for (const [placeholder, value] of Object.entries(placeholders)) {
                const index = run.text.indexOf(placeholder);
                if (index >= 0) {
                  const before = run.text.substring(0, index);
                  const match = placeholder;
                  const after = run.text.substring(index + placeholder.length);
                  let newRuns = [];
                  if (before) newRuns.push({ text: before });
                  if (placeholder === '{{logoInmobiliaria}}') {
                    if (value) {
                      try {
                        const imageResponse = await fetch(value);
                        const imageBuffer = await imageResponse.arrayBuffer();
                        const base64Data = Buffer.from(imageBuffer).toString('base64');
                        const imageType = value.substring(value.lastIndexOf('.') + 1);
                        const embeddedObject = {
                          inlineObjects: {
                            [`${Date.now()}`]: {
                              objectType: 'image',
                              object: {
                                imageProperties: {
                                  sourceUrl: value,
                                },
                              },
                              inlineObjectProperties: {
                                embeddedObject: {
                                  imageProperties: {
                                    width: { magnitude: 140, unit: 'PT' },
                                    height: { magnitude: 35, unit: 'PT' },
                                  },
                                },
                              },
                            },
                          };

                        newRuns.push({
                          inlineObjectElement: {
                            inlineObjectId: Object.keys(embeddedObject.inlineObjects)[0],
                          },
                        });

                        const imageInsertRequest = {
                          insertInlineImage: {
                            objectId: Object.keys(embeddedObject.inlineObjects)[0],
                            image: {
                              content: base64Data,
                              mimeType: `image/${imageType}`,
                            },
                            position: {
                              elementId: element.paragraph.elements[0].textRun?.suggestedInsertionIds?.[0] || undefined,
                              offset: before.length,
                            },
                          },
                        };
                        await docs.documents.batchUpdate({
                          documentId: docId,
                          requestBody: {
                            requests: [imageInsertRequest],
                          },
                        });
                      }
                      catch (e: any) {
                        console.error(`Error inserting image: ${e.message || e}`);
                        newRuns.push({ text: 'Error loading image' });
                      }
                    }
                    else {
                      newRuns.push({ text: '' });
                    }
                  }
                  else {
                    newRuns.push({ text: value });
                  }
                  if (after) newRuns.push({ text: after });
                  element.paragraph.runs = newRuns;
                }
              }
            }
          }
        } else if (element.table) {
          for (let row of element.table.tableRows) {
            for (let cell of row.tableCells) {
              if (cell.content) {
                await replaceContent(cell.content);
              }
            }
          }
        }
        else if (element.header) {
          await replaceContent(element.header.content);
        }
      }
    };
    await replaceContent(content);

    await docs.documents.patch({
      documentId: docId,
      requestBody: {
        requests: content ? [{
          updateDocumentContent: {
            document: {
              body: {
                content: content
              }
            }
          }
        }] : [],
      },
    });

    const newName = `Contrato de Alquiler ${rowData.fields.nombreLocadorPF1 || 'Desconocido'} - ${rowData.fields.nombreLocatarioPF1 || 'Desconocido'}`;
    await drive.files.update({
      fileId: docId,
      requestBody: {
        name: newName,
      },
    });

    const pdfResponse = await drive.files.export({
      fileId: docId,
      mimeType: 'application/pdf',
    });
    const pdfFileName = `${newName}.pdf`;

    const pdfFileMetadata = {
      name: pdfFileName,
      parents: [DESTINATION_FOLDER_ID],
    };
    const media = {
      mimeType: 'application/pdf',
      body: pdfResponse.data,
    };
    const createdPdfFile = await drive.files.create({
      requestBody: pdfFileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
    });

    if (!createdPdfFile.data.id) {
      throw new Error("Failed to create PDF file in Drive");
    }
    const pdfDownloadUrl = createdPdfFile.data.webViewLink;
    const pdfDocUrl = createdPdfFile.data.webContentLink;

    const docDownloadUrl = `https://docs.google.com/document/d/${docId}/export?format=docx`;

    return {
      docId: docId,
      pdfId: createdPdfFile.data.id,
      pdfDownloadUrl: pdfDownloadUrl,
      docDownloadUrl: docDownloadUrl,
      pdfDocUrl: pdfDocUrl
    };
  } catch (error: any) {
    console.error('Error al generar los documentos:', error);
    throw new Error(`Error al generar los documentos: ${error.message}`);
  }
}

/* Función para actualizar los links en Airtable y almacenar los archivos */
async function updateAirtableWithLinksAndFiles(recordId: string, docDownloadUrl: string, pdfDownloadUrl: string, pdfDocUrl: string) {
  const base = new Airtable({ apiKey: AIRTABLE_PERSONAL_ACCESS_TOKEN }).base(AIRTABLE_BASE_ID_CONTRACT_DATABASE);
  try {
    const docFile = {
      url: docDownloadUrl,
      filename: 'Contrato.docx'
    };
    const pdfFile = {
      url: pdfDownloadUrl,
      filename: 'Contrato.pdf'
    };
    const pdfDocFile = {
      url: pdfDocUrl,
      filename: 'Contrato.pdf'
    };

    await base(AIRTABLE_CONTRACTS_TABLE_NAME).update([
      {
        id: recordId,
        fields: {
          DOCFile: [docFile],
          PDFFile: [pdfFile],
          PDFDocFile: [pdfDocFile]
        },
      },
    ]);
  } catch (error: any) {
    console.error(`Error al actualizar los links y archivos en Airtable: ${error}`);
    throw new Error(`Error al actualizar los links y archivos en Airtable: ${error.message}`);
  }
}

/* Función para enviar el email usando Resend */
async function sendEmailWithResend(emailMember: string, emailGuest: string, nombreCliente: string, pdfDownloadUrl: string, docDownloadUrl: string) {
  const Resend = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject = "Tu Contrato de Locación de vivienda está listo";
  const contractTypeDescription = "Contrato de Locación de vivienda";
  const sendEmail = async (to: string) => {
    if (!to) return;
    try {
      const data = await resend.emails.send({
        from: 'Acuerdos Inmobiliarios <contratos@inmoacuerdos.com>',
        to: [to],
        subject: subject,
        html: `<p>Estimado ${nombreCliente},</p>
                <p>Tu contrato de locación de vivienda está listo para ser descargado.</p>
                <p>Puedes acceder a los documentos a través de los siguientes enlaces:</p>
                <ul>
                  <li><a href="${pdfDownloadUrl}">Descargar Contrato (PDF)</a></li>
                  <li><a href="${docDownloadUrl}">Descargar Contrato (DOCX)</a></li>
                </ul>
                <p>Gracias por utilizar InmoAcuerdos.</p>`,
      });
      console.log(`Email sent to ${to} with Resend:`, data);
    } catch (error: any) {
      console.error(`Error sending email to ${to} with Resend:`, error);
      throw new Error(`Error enviando email con Resend: ${error.message}`);
    }
  };
  await sendEmail(emailMember);
  await sendEmail(emailGuest);
}

/* Función para decrementar los tokens del usuario en Memberstack */
async function decrementMemberstackTokens(memberstackId: string) {
  const vercelUpdateMetadataUrl = `${process.env.VERCEL_URL}/api/memberstack/updateMemberMetadata`;

  const payload = JSON.stringify({
    memberId: memberstackId,
    newMetadata: {
      tokens: -1,
    },
  });

  try {
    const response = await fetch(vercelUpdateMetadataUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error decrementing tokens: ${response.status} - ${errorText}`);
      return false;
    }

    const responseJson = await response.json();
    return responseJson.success === true;
  } catch (error) {
    console.error('Error decrementing Memberstack tokens:', error);
    return false;
  }
}

/* Función para obtener la información del miembro de Memberstack */
async function getMemberstackMemberData(memberstackId: string) {
  const vercelGetMetadataUrl = `${process.env.VERCEL_URL}/api/memberstack/getMemberMetadata?memberId=${memberstackId}`;
  try {
    const response = await fetch(vercelGetMetadataUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error fetching member data: ${response.status} - ${errorText}`);
      return null;
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching member data from Memberstack", error);
    return null;
  }
}

/* Función para remover al usuario del plan en Memberstack */
async function removeMemberFromPlanInMemberstack(memberstackId: string, planId: string) {
  const vercelRemoveFromPlanUrl = `${process.env.VERCEL_URL}/api/memberstack/removeMemberFromPlan`;

  const payload = JSON.stringify({
    memberId: memberstackId,
    planId: planId
  });
  try {
    const response = await fetch(vercelRemoveFromPlanUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: payload
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to remove member from plan: ${response.status} - ${errorText}`);
      return false;
    }
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error("Error removing member from plan", error);
    return false;
  }
}

/* Función para crear un item en Webflow */
async function createWebflowItem(collectionId: string, itemData: any) {
  const url = `https://api.webflow.com/collections/${collectionId}/items`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WEBFLOW_API_TOKEN}`,
        'Content-Type': 'application/json',
        'accept-version': '1.0.0',
      },
      body: JSON.stringify({ fields: itemData }),
    });

    if (!response.ok) {
      const errorJson = await response.json();
      console.error('Error al crear el item en Webflow:', errorJson);
      throw new Error(`Error al crear el item en Webflow: ${response.status} - ${JSON.stringify(errorJson)}`);
    }
    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('Error al crear el item en Webflow:', error);
    throw new Error(`Error al crear el item en Webflow: ${error.message}`);
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { recordId } = req.body;
  if (!recordId) {
    return res.status(400).json({ error: 'Falta el ID del registro de Airtable' });
  }

  try {
    const credentials = JSON.parse(Buffer.from(GOOGLE_APPLICATION_CREDENTIALS_SECRET, 'base64').toString('utf-8'));
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/documents', 'https://www.googleapis.com/auth/drive'],
    });
    const authClient = await auth.getClient();


    const rowData = await getRowDataFromAirtable(recordId);

    const { pdfDownloadUrl, docDownloadUrl, pdfDocUrl } = await generateDocuments(rowData, authClient);

    await updateAirtableWithLinksAndFiles(recordId, docDownloadUrl, pdfDownloadUrl, pdfDocUrl);

    /* --- Envío de Correo --- */
    const emailMember = rowData.fields.emailMember;
    const emailGuest = rowData.fields.emailGuest;
    const nombreCliente = rowData.fields.nombreLocatarioPF1;
    await sendEmailWithResend(emailMember, emailGuest, nombreCliente, pdfDownloadUrl, docDownloadUrl);

    /* --- Creación de item en Webflow --- */
    try {

      const nombreLocador = rowData.fields.nombreLocadorPF1 || "No Disponible";
      const nombreLocatario = rowData.fields.nombreLocatarioPF1 || "No Disponible";
      const fechaInicioContrato = rowData.fields.fechaInicioContrato || "No Disponible";
      const fechaFinContrato = rowData.fields.fechaFinContrato || "No Disponible";
      const precioAlquiler = rowData.fields.precioAlquiler || "No Disponible";
      const domicilioInmueble = rowData.fields.domicilioInmueble || "No Disponible";
      const pdfFileUrl = pdfDownloadUrl || "No Disponible";

      const webflowItemData = {
        nombre: `Contrato de Alquiler - ${nombreLocador} - ${nombreLocatario}`,
        locador: nombreLocador,
        locatario: nombreLocatario,
        inicioContrato: fechaInicioContrato,
        finContrato: fechaFinContrato,
        precio: precioAlquiler,
        domicilio: domicilioInmueble,
        archivo: pdfFileUrl,
        estado: "Generado",
      };

      const webflowResponse = await createWebflowItem(WEBFLOW_USER_COLLECTION_ID, webflowItemData);
      console.log('Item creado en Webflow:', webflowResponse);
    } catch (error) {
      console.error('Error al crear el item en Webflow:', error);
    }

    return res.status(200).json({
      message: 'Documentos generados y links actualizados en Airtable',
      pdfUrl: pdfDownloadUrl,
      docUrl: docDownloadUrl,
      pdfDocUrl: pdfDocUrl
    });
  } catch (error: any) {
    console.error('Error en la función principal de Vercel:', error);
    return res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
}
