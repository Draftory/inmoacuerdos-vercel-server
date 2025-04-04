// api/webhook-mercado-pago.js
import { MercadoPagoConfig } from 'mercadopago';
import crypto from 'crypto';

const MERCADO_PAGO_SECRET_KEY = process.env.MERCADO_PAGO_SECRET_KEY; // Asegúrate de tener esta variable de entorno configurada

export default async (req, res) => {
  if (req.method === 'POST') {
    try {
      const paymentId = req.query.id;
      const topic = req.query.topic;

      console.log('Notificación recibida:', { paymentId, topic });

      // **PASO 1: Verificar la autenticidad de la notificación**
      const signature = req.headers['x-signature'];
      if (!signature || !MERCADO_PAGO_SECRET_KEY) {
        console.error('Firma no encontrada o clave secreta no configurada.');
        return res.status(400).send('Firma no válida');
      }

      const [ts, v1] = signature.split(',');
      const tsValue = ts.split('=')[1];
      const v1Value = v1.split('=')[1];

      const data = `id=${paymentId};request-id=;ts=${tsValue};`; // Adaptar según la documentación

      const hmac = crypto.createHmac('sha256', MERCADO_PAGO_SECRET_KEY);
      hmac.update(data);
      const generatedSignature = hmac.digest('hex');

      if (generatedSignature !== v1Value) {
        console.error('Firma de Mercado Pago no válida.');
        return res.status(400).send('Firma no válida');
      }

      // **PASO 2: Consultar los detalles del pago**
      const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
      const payment = await client.payment.get({ id: paymentId });
      console.log('Detalles del pago:', payment);

      if (payment.status === 200 && payment.data.status === 'approved') {
        // **PASO 3: Actualizar Google Sheets**
        // Aquí iría tu lógica para interactuar con la API de Google Sheets
        console.log(`Pago ${paymentId} aprobado. Actualizando Google Sheets...`);
      } else {
        console.log(`El pago ${paymentId} no fue aprobado o hubo un problema.`);
      }

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