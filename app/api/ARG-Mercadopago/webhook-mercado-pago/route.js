export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      // 1. Verificar el tipo de contenido (opcional pero recomendado)
      if (req.headers['content-type'] !== 'application/json') {
        return res.status(400).json({ error: 'Content-Type debe ser application/json' });
      }

      // 2. Parsear el cuerpo de la solicitud JSON
      const webhookData = await req.json();

      // 3. Validar la estructura básica del JSON (opcional pero recomendado)
      if (!webhookData || !webhookData.action || !webhookData.data || !webhookData.data.id) {
        return res.status(400).json({ error: 'Estructura JSON inválida' });
      }

      // 4. Procesar la información de la webhook
      console.log('Webhook Recibida:', webhookData);

      // Aquí puedes agregar tu lógica de negocio para manejar el evento 'payment.created'
      // Por ejemplo, podrías:
      // - Guardar la información en una base de datos.
      // - Actualizar el estado de un pedido.
      // - Enviar una notificación.

      if (webhookData.action === 'payment.created') {
        const paymentId = webhookData.data.id;
        console.log(`Pago creado con ID: ${paymentId}`);
        // Aquí tu lógica específica para el evento 'payment.created'
      }

      // 5. Enviar una respuesta exitosa (código 200 OK)
      res.status(200).json({ received: true });

    } catch (error) {
      console.error('Error al procesar la webhook:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  } else {
    // Manejar otros métodos HTTP (si es necesario)
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}