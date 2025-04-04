import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const requestBody = await request.json();
    const type = requestBody?.type;
    const dataId = requestBody?.data?.id;
    const contractIdFromPayload = requestBody?.external_reference; // Intentamos obtenerlo directamente

    console.log('Webhook Recibida (POST):');
    console.log({ dataId, type });

    if (contractIdFromPayload) {
      console.log(`contractID recibido en el payload: ${contractIdFromPayload}`);
    } else {
      console.log('contractID no encontrado directamente en el payload.');
    }

    if (type === 'payment') {
      console.log(`ID de pago recibido: ${dataId}`);
      // Aquí iría tu lógica para procesar el evento de pago.
      // Recuerda que para obtener el external_reference de forma confiable,
      // probablemente necesites consultar la API de Mercado Pago con dataId.
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error al procesar el webhook:', error);
    return NextResponse.json({ received: false, error: 'Error al procesar el webhook' }, { status: 400 });
  }
}