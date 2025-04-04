import { NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';

export async function POST(request) {
  try {
    const requestBody = await request.json();
    const type = requestBody?.type;
    const dataId = requestBody?.data?.id;

    console.log('Webhook Recibida (POST):');
    console.log({ dataId, type });

    if (type === 'payment' && dataId) {
      console.log(`ID de pago recibido: ${dataId}`);

      // Inicializa el cliente de Mercado Pago
      const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
      const payment = new Payment(client);

      try {
        // Obtiene los detalles del pago desde la API de Mercado Pago
        const paymentDetails = await payment.get({ id: dataId });
        const contractId = paymentDetails.external_reference;

        if (contractId) {
          console.log(`contractID asociado al pago ${dataId}: ${contractId}`);
          // Aquí puedes implementar tu lógica que utiliza el contractID
        } else {
          console.log(`No se encontró external_reference para el pago ${dataId}`);
        }

      } catch (error) {
        console.error(`Error al obtener detalles del pago ${dataId}:`, error);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error al procesar el webhook:', error);
    return NextResponse.json({ received: false, error: 'Error al procesar el webhook' }, { status: 400 });
  }
}