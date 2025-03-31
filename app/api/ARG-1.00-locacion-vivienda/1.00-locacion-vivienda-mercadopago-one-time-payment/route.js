// app/api/ARG-1.00-locacion-vivienda/1.00-locacion-vivienda-mercadopago-one-time-payment/route.js
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
    const req = await request.json();
    const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
    const preference = new Preference(client);

    const preferenceResult = await preference.create({
      items: [
        {
          title: req.title,
          quantity: Number(req.quantity),
          unit_price: Number(req.price),
          currency_id: 'ARS',
        },
      ],
      back_urls: {
        success: 'https://www.inmoacuerdos.com/pago-exitoso',
        failure: 'https://www.inmoacuerdos.com/pago-fallido',
        pending: 'https://www.inmoacuerdos.com/pago-pendiente',
      },
      auto_return: 'approved',
      notification_url: 'https://inmoacuerdos-vercel-server.vercel.app/api/ARG-1.00-locacion-vivienda/1.00-locacion-vivienda-mercadopago-one-time-payment/webhook-mercado-pago', // Ajusta la ruta si es necesario
    });

    return new NextResponse(JSON.stringify({ init_point: preferenceResult.init_point }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error('Error al crear la preferencia:', error);
    return new NextResponse(JSON.stringify({ error: 'Error al crear la preferencia de pago' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}