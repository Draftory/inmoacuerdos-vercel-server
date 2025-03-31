// api/webhook-mercado-pago.js
import { MercadoPagoConfig } from 'mercadopago';

export default async (req, res) => {
  if (req.method === 'POST') {
    try {
      const paymentId = req.query.id;
      const topic = req.query.topic;

      console.log('Notificación recibida:', { paymentId, topic });

      // Aquí deberías verificar la autenticidad de la notificación y
      // consultar los detalles del pago a la API de Mercado Pago
      // para actualizar tu base de datos.

      res.status(200).send('OK');
    } catch (error) {
      console.error('Error al procesar la notificación:', error);
      res.status(500).send('Error al procesar la notificación');
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};