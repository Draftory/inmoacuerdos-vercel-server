// app/api/create-preference-bricks/route.js
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextResponse } from 'next/server';

const allowedOrigins = [
  'https://www.inmoacuerdos.com',
  'https://inmoacuerdos.webflow.io',
];

export async function OPTIONS(request) {
  const origin = request.headers.get('origin');

  if (allowedOrigins.includes(origin)) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  return new NextResponse(null, { status: 405, body: 'Method Not Allowed' });
}

export async function POST(request) {
  const origin = request.headers.get('origin');

  if (!allowedOrigins.includes(origin)) {
    return new NextResponse(JSON.stringify({ error: 'Not allowed origin' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
    const preference = new Preference(client);

    const preferenceResult = await preference.create({
      body: {
        items: [
          {
            title: 'Descripción de tu producto/servicio', // Reemplaza con la descripción real
            quantity: 1, // Reemplaza con la cantidad
            unit_price: 100.00, // Reemplaza con el precio
            currency_id: 'ARS',
          },
        ],
        back_urls: {
          success: 'https://www.inmoacuerdos.com/pago-exitoso', // Reemplaza con tus URLs
          failure: 'https://www.inmoacuerdos.com/pago-fallido',
          pending: 'https://www.inmoacuerdos.com/pago-pendiente',
        },
        auto_return: 'approved',
        notification_url: 'https://inmoacuerdos-vercel-server.vercel.app/api/ARG-1.00-locacion-vivienda/webhook-mercado-pago', // Reemplaza con tu URL de webhook
      },
    });

    return NextResponse.json({ preferenceId: preferenceResult.id });
  } catch (error) {
    console.error('Error al crear la preferencia:', error);
    return new NextResponse(JSON.stringify({ error: 'Error al crear la preferencia' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}