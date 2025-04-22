import { NextResponse } from "next/server";
import { MercadoPagoConfig, Payment } from "mercadopago";

export async function POST(request) {
  try {
    const requestBody = await request.json();
    const type = requestBody?.type;
    const dataId = requestBody?.data?.id;

    console.log("Webhook Recibida (POST):");
    console.log({ dataId, type });

    if (type === "payment" && dataId) {
      console.log(`ID de pago recibido: ${dataId}`);

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
          console.log(
            `external_reference asociado al pago ${dataId}: ${externalReference}`
          );
          console.log(`Estado del pago ${dataId}: ${paymentStatus}`);
          console.log(`Fecha de pago ${dataId}: ${paymentDate}`);

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

          console.log(`contractID extraído: ${contractId}`);
          console.log(`MemberstackID extraído: ${memberstackId}`);
          console.log(`tipoDePago extraído: ${tipoDePago}`);

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

          console.log("Datos a enviar a Google Sheets:", updateData);

          // URL de tu función de Vercel para Google Sheets
          const googleSheetsApiUrl =
            "https://inmoacuerdos-vercel-server.vercel.app/api/ARG-Mercadopago/update-payment-status";

          try {
            const response = await fetch(googleSheetsApiUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify(updateData),
            });

            if (response.ok) {
              const result = await response.json();
              console.log("Google Sheets actualizado exitosamente:", result);
            } else {
              console.error(
                "Error al actualizar Google Sheets:",
                response.status,
                response.statusText
              );
              const errorResult = await response.json();
              console.error("Google Sheets error details:", errorResult);
            }
          } catch (error) {
            console.error("Error al hacer la petición a Google Sheets:", error);
          }
        } else {
          console.log(
            `No se encontró external_reference para el pago ${dataId}`
          );
        }
      } catch (error) {
        console.error(`Error al obtener detalles del pago ${dataId}:`, error);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error al procesar el webhook:", error);
    return NextResponse.json(
      { received: false, error: "Error al procesar el webhook" },
      { status: 400 }
    );
  }
}
