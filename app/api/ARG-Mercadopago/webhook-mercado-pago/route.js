import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Importante: Asegúrate de que la variable de entorno esté configurada en Vercel.
const MERCADO_PAGO_SECRET_KEY = process.env.MERCADO_PAGO_SECRET_KEY; // Cambiamos el nombre de la variable

export async function POST(request) {
  const searchParams = new URL(request.url).searchParams;
  const dataId = searchParams.get('data.id');
  const type = searchParams.get('type');

  console.log('Webhook Recibida (POST con parámetros en la URL - App Router):');
  console.log({ dataId, type });

  // 1. Obtener los headers relevantes
  const signatureHeader = request.headers.get('x-signature');
  const requestIdHeader = request.headers.get('x-request-id');

  // 2. Validar que la clave secreta esté configurada
  if (!MERCADO_PAGO_SECRET_KEY) { // Usamos el nuevo nombre de la variable
    console.error('Error: La clave secreta del webhook de Mercado Pago no está configurada (MERCADO_PAGO_SECRET_KEY).');
    return NextResponse.json({ error: 'Clave secreta no configurada' }, { status: 500 });
  }

  // 3. Validar la firma
  if (signatureHeader) {
    const signatureParts = signatureHeader.split(',');
    let ts = null;
    let v1 = null;

    signatureParts.forEach(part => {
      const [key, value] = part.split('=');
      if (key === 'ts') {
        ts = value;
      } else if (key === 'v1') {
        v1 = value;
      }
    });

    if (ts && v1) {
      // 4. Crear el template para la firma
      let signatureTemplate = `id:${dataId ? dataId.toLowerCase() : ''};`;
      if (requestIdHeader) {
        signatureTemplate += `request-id:${requestIdHeader};`;
      }
      signatureTemplate += `ts:${ts};`;

      // Eliminar el último punto y coma si existe
      if (signatureTemplate.endsWith(';')) {
        signatureTemplate = signatureTemplate.slice(0, -1);
      }

      console.log('dataId:', dataId);
      console.log('requestIdHeader:', requestIdHeader);
      console.log('Template de firma (justo antes del cálculo):', signatureTemplate);

      // 5. Calcular la firma esperada
      const expectedSignature = crypto
        .createHmac('sha256', MERCADO_PAGO_SECRET_KEY) // Usamos el nuevo nombre de la variable
        .update(signatureTemplate)
        .digest('hex');

      console.log('Firma recibida:', v1);
      console.log('Firma esperada:', expectedSignature);

      // 6. Comparar las firmas
      if (v1 === expectedSignature) {
        console.log('Firma de Mercado Pago validada correctamente.');

        if (type === 'payment') {
          console.log(`ID de pago recibido (POST - App Router): ${dataId}`);
          // Agrega aquí tu lógica para el evento de pago
        }

        return NextResponse.json({ received: true, method: 'POST', query_params: Object.fromEntries(searchParams), signature_valid: true });
      } else {
        console.error('Error: La firma de Mercado Pago no es válida.');
        return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
      }
    } else {
      console.error('Error: Faltan los parámetros ts o v1 en el header x-signature.');
      return NextResponse.json({ error: 'Faltan parámetros en la firma' }, { status: 400 });
    }
  } else {
    console.warn('Advertencia: No se encontró el header x-signature. No se pudo validar el origen.');
    // Decide si quieres procesar la notificación sin validación o rechazarla.
    // Por seguridad, es recomendable rechazarla o al menos registrar la falta de firma.
    return NextResponse.json({ received: true, method: 'POST', query_params: Object.fromEntries(searchParams), signature_valid: false, warning: 'No se encontró el header x-signature' });
  }
}