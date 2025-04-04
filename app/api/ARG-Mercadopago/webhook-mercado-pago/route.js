export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // 🔐 Verificación del token enviado por Mercado Pago
  const webhookToken = process.env.MERCADO_PAGO_WEBHOOK_ACCESS_TOKEN;
  const incomingToken = req.headers.authorization?.replace('Bearer ', '');

  if (incomingToken !== webhookToken) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const { type, action, data } = req.body;

  // Solo nos interesa el evento de pago creado
  if (type === 'payment' && action === 'payment.created') {
    const paymentId = data.id;

    try {
      const mpAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

      // Consultar los detalles del pago usando la API de Mercado Pago
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Error al consultar el pago:', errorData);
        return res.status(500).json({ error: 'Error al consultar el pago' });
      }

      const paymentInfo = await response.json();

      // 🎯 Acá podés hacer lo que necesites con el pago: actualizar tu base de datos, enviar emails, etc.
      console.log('✅ Pago recibido:', {
        id: paymentInfo.id,
        status: paymentInfo.status,
        email: paymentInfo.payer?.email,
        monto: paymentInfo.transaction_amount,
      });

      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('❌ Error en el webhook:', error);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
  }

  // Si no es un evento relevante, devolver 200 igual para que MP no lo reintente
  return res.status(200).json({ ignored: true });
}
