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

    if (type === "payment" && dataId) {
      logger.info(`ID de pago recibido: ${dataId}`);

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
          logger.info(`external_reference asociado al pago ${dataId}: ${externalReference}`);
          logger.info(`Estado del pago ${dataId}: ${paymentStatus}`);
          logger.info(`Fecha de pago ${dataId}: ${paymentDate}`);

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

          logger.info(`contractID extraído: ${contractId}`);
          logger.info(`MemberstackID extraído: ${memberstackId}`);
          logger.info(`tipoDePago extraído: ${tipoDePago}`);

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
            return NextResponse.json(
              {
                error: "Failed to update payment status in Supabase.",
                details: updateError.message
              },
              { status: 500 }
            );
          }

          logger.info('Estado del pago actualizado exitosamente en Supabase', contractId);

          // Llamar a update-payment-status para manejar la generación de documentos
          const updatePaymentStatusUrl = "https://inmoacuerdos-vercel-server.vercel.app/api/ARG-Mercadopago/update-payment-status";
          const updateData = {
            contractID: contractId,
            payment_id: dataId,
            estadoDePago: paymentStatus === "approved" ? "Pagado" : paymentStatus,
            fechaDePago: paymentDate ? new Date(paymentDate).toISOString() : null,
            memberstackID: memberstackId,
            tipoDePago: tipoDePago || 'Mercado Pago'
          };

          try {
            const response = await fetch(updatePaymentStatusUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(updateData),
            });

            if (response.ok) {
              const result = await response.json();
              logger.info('Proceso de actualización de pago completado', contractId);
              return NextResponse.json({ received: true, result });
            } else {
              logger.error(`Error al llamar a update-payment-status: ${response.statusText}`, contractId);
              const errorResult = await response.json();
              logger.error('Detalles del error:', errorResult);
              return NextResponse.json(
                {
                  error: "Failed to process payment status update.",
                  details: errorResult
                },
                { status: 500 }
              );
            }
          } catch (error) {
            logger.error(`Error al hacer la petición a update-payment-status: ${error.message}`, contractId);
            return NextResponse.json(
              { error: "Error al procesar la actualización del pago" },
              { status: 500 }
            );
          }
        } else {
          logger.info(`No se encontró external_reference para el pago ${dataId}`);
          return NextResponse.json({ received: true });
        }
      } catch (error) {
        logger.error(`Error al obtener detalles del pago ${dataId}: ${error.message}`);
        return NextResponse.json(
          { error: "Error al obtener detalles del pago" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error(`Error al procesar el webhook: ${error.message}`);
    return NextResponse.json(
      { received: false, error: "Error al procesar el webhook" },
      { status: 400 }
    );
  }
}
