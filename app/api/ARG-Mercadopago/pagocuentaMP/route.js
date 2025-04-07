// app/api/create-preference-pro/route.js
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextResponse } from 'next/server';

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

export async function POST(req) {
  console.log('Starting API request to create Mercado Pago Preference');
  const origin = req.headers.get('origin');
  const headers = {
    'Access-Control-Allow-Origin': allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    const requestBody = await req.json();
    const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
    const preference = new Preference(client);

    // Extract contractID, Contrato y MemberstackID del requestBody
    const { contractID, Contrato, title, quantity, price, MemberstackID } = requestBody;

    // Adjust product details based on Contrato
    let adjustedTitle = title;
    let adjustedPrice = price;

    if (Contrato === 'Locación de vivienda') {
      adjustedTitle = 'InmoAcuerdos - Contrato de locaón de vivienda';
      adjustedPrice = 4999;
    }

    // Log contractID, Contrato y MemberstackID
    console.log(`contractID: ${contractID}, Contrato: ${Contrato}, MemberstackID: ${MemberstackID}`);

    // Construir el external_reference (opcionalmente incluir MemberstackID)
    const externalReference = MemberstackID
      ? `${contractID}-${MemberstackID}`
      : contractID;

    const preferenceResult = await preference.create({
      body: {
        items: [
          {
            title: adjustedTitle,
            quantity: Number(quantity),
            unit_price: Number(adjustedPrice),
            currency_id: 'ARS',
          },
        ],
        back_urls: {
          success: 'https://www.inmoacuerdos.com/pago-exitoso', // Reemplaza con tu URL de ÃƒÂ©xito
          failure: 'https://www.inmoacuerdos.com/pago-fallido', // Reemplaza con tu URL de fallo
          pending: 'https://www.inmoacuerdos.com/pago-pendiente', // Reemplaza con tu URL de pendiente
        },
        auto_return: 'approved',
        external_reference: externalReference, // Incluimos el contractID y opcionalmente MemberstackID
      },
    });

    return new NextResponse(JSON.stringify({ init_point: preferenceResult.init_point }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error al crear la preferencia:', error);
    return new NextResponse(JSON.stringify({ error: 'Error al crear la preferencia de pago' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
}