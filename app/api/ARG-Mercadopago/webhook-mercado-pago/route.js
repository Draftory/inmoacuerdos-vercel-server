import { logger } from '../../../utils/logger';
import { NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";

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

        // Construir el objeto para actualizar Google Sheets
        const updateData = {
          contractID: contractId,
          payment_id: dataId,
          estadoDePago:
            paymentStatus === "approved" ? "Pagado" : paymentStatus,
          fechaDePago: paymentDate
            ? new Date(paymentDate).toISOString()
            : null,
          memberstackID: memberstackId,
          tipoDePago: tipoDePago,
        };

        logger.info('Enviando datos a Google Sheets', contractId);

        // URL de tu función de Vercel para Google Sheets
        const googleSheetsApiUrl =
          "https://inmoacuerdos-vercel-server.vercel.app/api/ARG-Mercadopago/update-payment-status";

        const response = await fetch(googleSheetsApiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        });

        if (!response.ok) {
          logger.error(`Error al actualizar estado del pago: ${response.statusText}`, contractId);
          return new Response(
            JSON.stringify({
              error: "Failed to update payment status in Google Sheets.",
            }),
            { status: 500 }
          );
        }

        logger.info('Estado del pago actualizado exitosamente', contractId);
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
