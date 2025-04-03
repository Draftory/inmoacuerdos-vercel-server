// app/api/ARG-Mercadopago/webhook-mercado-pago/route.js
import { NextResponse } from 'next/server';
import mercadopago from 'mercadopago';

// Configura tu access token
mercadopago.configure({
    access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN,
});

export async function POST(req) {
    try {
        const payment = req.body;

        if (payment.topic === 'merchant_order') {
            const orderId = payment.resource.split('/').pop(); // Obtiene el ID de la orden

            // Obtiene los detalles de la orden
            const order = await mercadopago.merchant_orders.get(orderId);

            if (order.response && order.response.external_reference) {
                const contractID = order.response.external_reference;

                // Obtiene los detalles de los pagos
                const payments = order.response.payments;

                for (const payment of payments) {
                    const paymentId = payment.id;
                    const paymentStatus = payment.status;

                    // Actualiza tu base de datos
                    await actualizarPagoEnBaseDeDatos(contractID, paymentId, paymentStatus);

                    console.log(`Pago ${paymentId} (${paymentStatus}) recibido para contrato ${contractID}`);
                }
            } else {
                console.error('No se encontró external_reference en la orden');
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