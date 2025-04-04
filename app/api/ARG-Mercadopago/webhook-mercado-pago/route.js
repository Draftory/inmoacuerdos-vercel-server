import { google } from 'googleapis';
import { auth } from 'google-auth-library';
import crypto from 'crypto';

// Accediendo a las variables de entorno
const SPREADSHEET_ID = process.env.LOCACION_POST_DATABASE_SHEET_ID;
const SHEET_NAME = process.env.LOCACION_POST_DATABASE_SHEET_NAME;
const GOOGLE_CREDENTIALS_SECRET = process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;
const ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN; // Usando el nombre de variable actualizado
const MERCADO_PAGO_SECRET_KEY = process.env.MERCADO_PAGO_SECRET_KEY; // Usando el nombre de variable actualizado
const BASE_URL = 'https://api.mercadopago.com';

// Función para obtener las credenciales de Google desde el secreto
function getGoogleCredentials() {
  try {
    return JSON.parse(GOOGLE_CREDENTIALS_SECRET);
  } catch (error) {
    console.error('Error al parsear las credenciales de Google:', error);
    return null;
  }
}

async function getPaymentDetails(paymentId) {
  try {
    const response = await fetch(`${BASE_URL}/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`, // Usando el nombre de variable actualizado
      },
    });
    if (!response.ok) {
      console.error(`Error al obtener detalles del pago ${paymentId}: ${response.status} - ${await response.text()}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error('Error al comunicarse con la API de Mercado Pago:', error);
    return null;
  }
}

async function updatePaymentStatusInSheet(contractId, paymentId) {
  try {
    const credentials = getGoogleCredentials();
    if (!credentials) {
      console.error('No se pudieron cargar las credenciales de Google.');
      return false;
    }

    const client = auth.fromJSON(credentials);
    client.scopes = ['https://www.googleapis.com/auth/spreadsheets'];
    const sheets = google.sheets({ version: 'v4', auth: client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:Z`,
    });

    const rows = response.data?.values;
    if (rows) {
      const headerRow = rows[0] || [];
      const contractIdColumnIndex = headerRow.findIndex(header => header.toLowerCase() === 'contractid');
      const estadoDePagoColumnIndex = headerRow.findIndex(header => header.toLowerCase() === 'estadodepago');
      const fechaDePagoColumnIndex = headerRow.findIndex(header => header.toLowerCase() === 'fechadepago');
      const paymentIdColumnIndex = headerRow.findIndex(header => header.toLowerCase() === 'payment_id');
      const statusColumnIndex = headerRow.findIndex(header => header.toLowerCase() === 'status'); // Obtener el índice de la columna "status"

      if (contractIdColumnIndex === -1) {
        console.error('No se encontró la columna "contractid" en la hoja de cálculo.');
        return false;
      }

      for (let i = 1; i < rows.length; i++) {
        if (rows[i][contractIdColumnIndex] === contractId) {
          const updateValues = [];
          const updateRanges = [];

          // Actualizar estadoDePago
          if (estadoDePagoColumnIndex !== -1) {
            updateValues.push(['Pagado']);
            updateRanges.push(`${SHEET_NAME}!${String.fromCharCode(65 + estadoDePagoColumnIndex)}${i + 1}`);
          } else {
            console.warn('No se encontró la columna "estadoDePago".');
          }

          // Actualizar fechaDePago
          if (fechaDePagoColumnIndex !== -1) {
            const currentDate = new Date().toISOString(); // Formato ISO 8601
            updateValues.push([currentDate]);
            updateRanges.push(`${SHEET_NAME}!${String.fromCharCode(65 + fechaDePagoColumnIndex)}${i + 1}`);
          } else {
            console.warn('No se encontró la columna "fechaDePago".');
          }

          // Actualizar payment_id
          if (paymentIdColumnIndex !== -1 && paymentId) {
            updateValues.push([paymentId]);
            updateRanges.push(`${SHEET_NAME}!${String.fromCharCode(65 + paymentIdColumnIndex)}${i + 1}`);
          } else if (paymentIdColumnIndex === -1) {
            console.warn('No se encontró la columna "payment_id".');
          }

          // Actualizar status a "Contrato"
          if (statusColumnIndex !== -1) {
            updateValues.push(['Contrato']);
            updateRanges.push(`${SHEET_NAME}!${String.fromCharCode(65 + statusColumnIndex)}${i + 1}`);
          } else {
            console.warn('No se encontró la columna "status". No se activará la generación del documento automáticamente.');
          }

          // Realizar las actualizaciones en lote (más eficiente)
          if (updateValues.length > 0) {
            const batchUpdateRequest = {
              valueInputOption: 'USER_ENTERED',
              data: updateRanges.map((range, index) => ({
                range: range,
                values: updateValues[index],
              })),
            };

            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId: SPREADSHEET_ID,
              resource: batchUpdateRequest,
            });
            console.log(`Estado de pago, fecha de pago, payment_id y status actualizados para el contrato: ${contractId}`);
            return true;
          } else {
            console.warn(`No se encontraron columnas para actualizar para el contrato: ${contractId}`);
            return true; // Consideramos exitoso si se encontró el contrato pero no hay columnas para actualizar
          }
        }
      }
      console.log(`No se encontró el contrato con ID: ${contractId} en la hoja.`);
      return false;
    } else {
      console.log('No se encontraron datos en la hoja.');
      return false;
    }
  } catch (error) {
    console.error('Error al actualizar Google Sheets:', error);
    return false;
  }
}

export async function POST(req) {
  try {
    const signature = req.headers.get('x-signature');
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    console.log('Webhook recibido:', body);
    console.log('Firma recibida:', signature);

    // Validar la firma del webhook (si la clave secreta está configurada)
    if (MERCADO_PAGO_SECRET_KEY && signature && body && body.data && body.data.id) {
      const parts = signature.split(',');
      let ts = null;
      let v1 = null;
      for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 'ts') ts = value;
        if (key === 'v1') v1 = value;
      }

      if (ts && v1) {
        const signatureTemplate = `id:${body.data.id};request-id:;ts:${ts};`;
        const expectedSignature = crypto
          .createHmac('sha256', MERCADO_PAGO_SECRET_KEY)
          .update(signatureTemplate)
          .digest('hex');

        if (expectedSignature !== v1) {
          console.error('Firma del webhook no válida.');
          return new Response('Unauthorized', { status: 401 });
        } else {
          console.log('Firma del webhook validada correctamente.');
        }
      } else {
        console.warn('No se encontraron ts o v1 en la firma.');
      }
    } else if (!MERCADO_PAGO_SECRET_KEY) {
      console.warn('La clave secreta de Mercado Pago no está configurada. La firma del webhook no se puede validar.');
    }

    if (body && body.type === 'payment' && body.data && body.data.id) {
      const paymentId = body.data.id;
      console.log(`Procesando notificación de pago con ID: ${paymentId}`);

      const paymentDetails = await getPaymentDetails(paymentId);

      if (paymentDetails && paymentDetails.status === 'approved' && paymentDetails.external_reference) {
        const contractId = paymentDetails.external_reference;
        console.log(`Pago aprobado para el contrato con ID: ${contractId}, Payment ID: ${paymentId}`);
        const updated = await updatePaymentStatusInSheet(contractId, paymentId);
        if (updated) {
          // TODO: Aquí puedes disparar la lógica para generar el documento
          console.log(`Disparando generación de documento para el contrato: ${contractId}`);
        }
      } else {
        console.log(`El pago no fue aprobado o no se encontró la referencia externa para el ID: ${paymentId}. Detalles:`, paymentDetails);
      }
      return new Response('OK', { status: 200 });
    } else if (body && body.topic === 'merchant_order') {
      console.log('Notificación de orden comercial recibida. No se procesa en esta versión.');
      return new Response('OK', { status: 200 }); // Respondemos OK para evitar reintentos
    }
     else {
      console.log('Webhook recibido con formato incorrecto:', body);
      return new Response('Bad Request', { status: 400 });
    }
  } catch (error) {
    console.error('Error al procesar la notificación:', error);
    return new Response('Error', { status: 500 });
  }
}