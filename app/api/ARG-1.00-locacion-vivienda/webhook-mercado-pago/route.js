// app/api/ARG-1.00-locacion-vivienda/1.00-locacion-vivienda-mercadopago-one-time-payment/webhook-mercado-pago/route.js
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    console.log('Webhook recibido:', body);

    // Aquí va tu lógica para verificar la firma,
    // consultar los detalles del pago y actualizar Google Sheets.

    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('Error al procesar el webhook:', error);
    return new NextResponse('Error', { status: 500 });
  }
}

// Opcionalmente, si quieres manejar solicitudes OPTIONS para CORS preflight
export async function OPTIONS(request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', // Ajusta según tus necesidades de seguridad
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}