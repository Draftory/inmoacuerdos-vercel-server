// app/api/ARG-Mercadopago/webhook-mercado-pago/route.js
import { NextResponse } from 'next/server';
import mercadopago from 'mercadopago';

// Configura tu access token usando la nueva variable de entorno
mercadopago.configure({
    access_token: process.env.MERCADO_PAGO_WEBHOOK_ACCESS_TOKEN,
});

export async function POST(req) {
    try {
        const payment = req.body;

        if (payment.type === 'payment' && payment.action === 'payment.created') {
            const paymentId = payment.data.id;

            // Obtiene los detalles del pago
            const paymentDetails = await mercadopago.payments.get(paymentId);

            if (paymentDetails.response && paymentDetails.response.external_reference) {
                const contractID = paymentDetails.response.external_reference;
                const paymentStatus = paymentDetails.response.status;

                // Verifica el estado del pago
                if (paymentStatus === 'approved') {
                    // Actualiza tu base de datos
                    await actualizarPagoEnBaseDeDatos(contractID, paymentId, paymentStatus);

                    console.log(`Pago ${paymentId} (${paymentStatus}) recibido para contrato ${contractID}`);
                } else {
                    console.log(`Pago ${paymentId} (${paymentStatus}) no aprobado.`);
                }
            } else {
                console.error('No se encontró external_reference en el pago');
            }
        }

        return new NextResponse('OK', { status: 200 });
    } catch (error) {
        console.error('Error al procesar el webhook:', error);
        return new NextResponse('Error', { status: 500 });
    }
}

async function actualizarPagoEnBaseDeDatos(contractID, paymentId, paymentStatus) {
    // Implementa la lógica para actualizar tu base de datos
    // Ejemplo (usando una base de datos PostgreSQL):
    // await db.query('UPDATE contratos SET payment_id = $1, payment_status = $2 WHERE id = $3', [paymentId, paymentStatus, contractID]);
}