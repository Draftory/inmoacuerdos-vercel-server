import { google } from 'googleapis';
import { auth } from 'google-auth-library';
import crypto from 'crypto';

// Accediendo a las variables de entorno
const SPREADSHEET_ID = process.env.LOCACION_POST_DATABASE_SHEET_ID;
const SHEET_NAME = process.env.LOCACION_POST_DATABASE_SHEET_NAME;
const GOOGLE_CREDENTIALS_SECRET = process.env.GOOGLE_APPLICATION_CREDENTIALS_SECRET;
const ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const MERCADO_PAGO_SECRET_KEY = process.env.MERCADO_PAGO_SECRET_KEY;
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
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
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
  // ... (Tu función para actualizar Google Sheets - sin cambios aquí) ...
}

export async function POST(req) {
  try {
    const signature = req.headers.get('x-signature');
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const searchParams = req.nextUrl.searchParams;
    const dataIdFromUrl = searchParams.get('data.id');
    const requestIdHeader = req.headers.get('x-request-id') || '';
    const eventId = dataIdFromUrl || (body.data && body.data.id) || '';

    console.log('Webhook recibido:', body);
    console.log('Firma recibida:', signature);
    console.log('data.id desde URL:', dataIdFromUrl);
    console.log('x-request-id:', requestIdHeader);
    console.log('Event ID:', eventId);

    // Validar la firma del webhook (si la clave secreta está configurada y tenemos un eventId)
    if (MERCADO_PAGO_SECRET_KEY && signature && eventId) {
      const parts = signature.split(',');
      let ts = null;
      let v1 = null;
      for (const part of parts) {
        const [key, value] = part.split('=');
        if (key === 'ts') ts = value;
        if (key === 'v1') v1 = value;
      }

      if (ts && v1) {
        const signatureTemplate = `id:${eventId}${isNaN(parseInt(eventId)) ? '' : ''};request-id:${requestIdHeader};ts:${ts};`;
        const expectedSignature = crypto
          .createHmac('sha256', MERCADO_PAGO_SECRET_KEY)
          .update(signatureTemplate)
          .digest('hex');

        console.log('Cadena para firma:', signatureTemplate);
        console.log('Firma esperada:', expectedSignature);
        console.log('Firma recibida (v1):', v1);

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
    } else if (!eventId) {
      console.warn('No se pudo obtener el ID del evento para la validación de la firma.');
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
      return new Response('OK', { status: 200 });
    } else {
      console.log('Webhook recibido con formato incorrecto:', body);
      return new Response('Bad Request', { status: 400 });
    }
  } catch (error) {
    console.error('Error al procesar la notificación:', error);
    return new Response('Error', { status: 500 });
  }
}