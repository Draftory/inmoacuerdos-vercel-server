import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const requestBody = await request.json();
    const dataId = requestBody?.data?.id;
    const type = requestBody?.type;

    console.log('Webhook Recibida (POST con datos en el cuerpo JSON - App Router):');
    console.log({ dataId, type });

    if (type === 'payment') {
      console.log(`ID de pago recibido (POST - App Router - JSON): ${dataId}`);
      // Agrega aquí tu lógica para el evento de pago
    }

    return NextResponse.json({ received: true, method: 'POST', body: requestBody });
  } catch (error) {
    console.error('Error al leer el cuerpo JSON:', error);
    return NextResponse.json({ received: false, error: 'Error al leer el cuerpo JSON' }, { status: 400 });
  }
}