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
        const paymentStatus = paymentDetails.status;
        const paymentDate = paymentDetails.date_approved; // Fecha de aprobación del pago

        if (contractId) {
          console.log(`contractID asociado al pago ${dataId}: ${contractId}`);
          console.log(`Estado del pago ${dataId}: ${paymentStatus}`);
          console.log(`Fecha de pago ${dataId}: ${paymentDate}`);

          // Construir el formObject para actualizar Google Sheets
          const updateData = {
            contractID: contractId, // Necesario para identificar la fila
            payment_id: dataId,
            estadoDePago: paymentStatus === 'approved' ? 'Pagado' : paymentStatus,
            fechaDePago: paymentDate ? new Date(paymentDate).toISOString() : null, // Formatear la fecha
            // Asegúrate de que 'contractID' también sea una columna en tu GSheet
            // para que la función de actualización pueda encontrar la fila correcta.
          };

          console.log('Datos a enviar a Google Sheets:', updateData);

          // URL de tu función de Vercel para Google Sheets
          const origin = request.headers.get('origin');
          const googleSheetsApiUrl = `${origin}/api/ARG-Mercadopago/update-payment-status`;

          try {
            const response = await fetch(googleSheetsApiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updateData),
            });

            if (response.ok) {
              const result = await response.json();
              console.log('Google Sheets actualizado exitosamente:', result);
            } else {
              console.error('Error al actualizar Google Sheets:', response.status, response.statusText);
              const errorResult = await response.json();
              console.error('Google Sheets error details:', errorResult);
            }
          } catch (error) {
            console.error('Error al hacer la petición a Google Sheets:', error);
          }

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