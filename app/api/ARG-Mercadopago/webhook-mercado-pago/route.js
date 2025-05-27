import { logger } from '../../../utils/logger';
import { NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function POST(request) {
  try {
    const requestBody = await request.json();
    const type = requestBody?.type;
    const dataId = requestBody?.data?.id;

    logger.info('Webhook recibido', { dataId, type });

    if (!dataId) {
      logger.error('ID de pago no encontrado en la solicitud');
      return new Response(
        JSON.stringify({ error: "No payment ID found in request." }),
        { status: 400 }
      );
    }

    // Inicializa el cliente de Mercado Pago
    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
    });
    const payment = new Payment(client);

    try {
      // Obtiene los detalles del pago desde la API de Mercado Pago
      const paymentDetails = await payment.get({ id: dataId });
      const externalReference = paymentDetails.external_reference;
      const paymentStatus = paymentDetails.status;
      const paymentDate = paymentDetails.date_approved;

      if (externalReference) {
        logger.info(`Estado del pago: ${paymentStatus}`, externalReference.split('_')[0]);

        let contractId;
        let memberstackId;
        let tipoDePago;

        // Dividir el external_reference utilizando guiones bajos
        const parts = externalReference.split("_");
        contractId = parts[0];

        // Intenta extraer MemberstackID (asumiendo que sigue al contractId y comienza con 'mem_')
        memberstackId = parts.find((part) => part.startsWith("mem_")) || null;

        // Intenta extraer tipoDePago
        const tipoDePagoIndex = memberstackId
          ? parts.indexOf(memberstackId) + 1
          : 1;
        tipoDePago = parts[tipoDePagoIndex] || null;

        logger.info('Datos extraídos del pago', contractId);

        // Actualizar contrato en Supabase
        const { error: updateError } = await supabase
          .from('1.00 - Contrato de Locación de Vivienda - Database')
          .update({
            tipoDePago: tipoDePago || 'Mercado Pago',
            estadoDePago: paymentStatus === "approved" ? "Pagado" : paymentStatus,
            payment_id: dataId,
            fechaDePago: paymentDate ? new Date(paymentDate).toISOString() : null,
            status: 'Contrato'
          })
          .eq('contractID', contractId)
          .eq('MemberstackID', memberstackId);

        if (updateError) {
          logger.error(`Error al actualizar estado del pago en Supabase: ${updateError.message}`, contractId);
          return new Response(
            JSON.stringify({
              error: "Failed to update payment status in Supabase.",
              details: updateError.message
            }),
            { status: 500 }
          );
        }

        logger.info('Estado del pago actualizado exitosamente en Supabase', contractId);

        // Llamar a update-payment-status para manejar la generación de documentos
        const updatePaymentStatusUrl = `${process.env.NEXT_PUBLIC_VERCEL_URL}/api/ARG-Mercadopago/update-payment-status`;
        const updateData = {
          contractID: contractId,
          payment_id: dataId,
          estadoDePago: paymentStatus === "approved" ? "Pagado" : paymentStatus,
          fechaDePago: paymentDate ? new Date(paymentDate).toISOString() : null,
          memberstackID: memberstackId,
          tipoDePago: tipoDePago || 'Mercado Pago'
        };

        const response = await fetch(updatePaymentStatusUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          logger.error(`Error al llamar a update-payment-status: ${response.statusText}`, contractId);
          return new Response(
            JSON.stringify({
              error: "Failed to process payment status update.",
              details: await response.text()
            }),
            { status: 500 }
          );
        }

        logger.info('Proceso de actualización de pago completado', contractId);
        return new Response(
          JSON.stringify({ message: "Payment status updated successfully." }),
          { status: 200 }
        );
      } else {
        logger.error('external_reference no encontrado en los detalles del pago');
        return new Response(
          JSON.stringify({ error: "No external reference found in payment details." }),
          { status: 400 }
        );
      }
    } catch (error) {
      logger.error(`Error al obtener detalles del pago: ${error.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to fetch payment details from Mercado Pago." }),
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error(`Error en el webhook: ${error.message}`);
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      { status: 500 }
    );
  }
}
