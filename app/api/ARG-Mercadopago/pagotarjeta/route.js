// app/api/process-payment/route.js
import { MercadoPagoConfig, Payment } from 'mercadopago';
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
    const reqBody = await request.json();
    const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
    const payment = new Payment(client);

    const paymentResult = await payment.create({
      body: reqBody,
    });

    console.log('Resultado del pago:', paymentResult);

    return NextResponse.json(paymentResult.toJSON());
  } catch (error) {
    console.error('Error al crear el pago:', error);
    return new NextResponse(JSON.stringify({ error: 'Error al procesar el pago' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}