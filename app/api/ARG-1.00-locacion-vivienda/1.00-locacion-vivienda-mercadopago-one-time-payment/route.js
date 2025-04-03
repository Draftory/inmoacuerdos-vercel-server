// app/api/create-preference/route.js
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Type', // Asegúrate de incluir Content-Type aquí también
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
    const req = await request.json();
    const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
    const preference = new Preference(client);

    const preferenceResult = await preference.create({
      body: {
        items: [
          {
            title: req.items[0].title,
            quantity: Number(req.items[0].quantity),
            unit_price: Number(req.items[0].unit_price),
            currency_id: 'ARS',
          },
        ],
        purpose: 'wallet_purchase',
        // Puedes incluir más configuraciones de preferencia si es necesario
      },
    });

    return new NextResponse(JSON.stringify({ preference_id: preferenceResult.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*' },
    });
  } catch (error) {
    console.error('Error al crear la preferencia:', error);
    return new NextResponse(JSON.stringify({ error: 'Error al crear la preferencia de pago' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin || '*' },
    });
  }
}