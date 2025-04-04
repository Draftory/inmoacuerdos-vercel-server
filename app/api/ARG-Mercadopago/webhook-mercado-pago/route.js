import { NextResponse } from 'next/server';

export async function POST(request) {
  const searchParams = new URL(request.url).searchParams;
  const dataId = searchParams.get('data.id');
  const type = searchParams.get('type');

  console.log('Webhook Recibida (POST con parámetros en la URL - App Router):');
  console.log({ dataId, type });

  if (type === 'payment') {
    console.log(`ID de pago recibido (POST - App Router): ${dataId}`);
    // Agrega aquí tu lógica para el evento de pago
  }

  return NextResponse.json({ received: true, method: 'POST', query_params: Object.fromEntries(searchParams) });
}