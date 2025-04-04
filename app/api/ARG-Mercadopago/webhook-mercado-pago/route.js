// api/webhook-mercado-pago.js
import { MercadoPagoConfig } from 'mercadopago';
import crypto from 'crypto';

const MERCADO_PAGO_SECRET_KEY = process.env.MERCADO_PAGO_SECRET_KEY;
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;

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

      // **IMPORTANTE:** La forma de construir la data para verificar la firma
      // puede variar ligeramente según la documentación más reciente de Mercado Pago.
      // Asegúrate de verificar la documentación oficial para la construcción correcta
      // de la cadena 'data' que se utiliza para generar la firma.
      // A partir de la documentación que proporcionaste, parece que la siguiente
      // construcción es la correcta para las notificaciones de pago.
      const data = `id=${paymentId};request-id=;ts=${tsValue};`;

      const hmac = crypto.createHmac('sha256', MERCADO_PAGO_SECRET_KEY);
      hmac.update(data);
      const generatedSignature = hmac.digest('hex');

      if (generatedSignature !== v1Value) {
        console.error('Firma de Mercado Pago no válida.');
        return res.status(400).send('Firma no válida');
      }

      // **PASO 2: Consultar los detalles del pago**
      if (!MERCADO_PAGO_ACCESS_TOKEN) {
        console.error('La variable de entorno MERCADO_PAGO_ACCESS_TOKEN no está configurada.');
        return res.status(500).send('Error de configuración');
      }
      const client = new MercadoPagoConfig({ accessToken: MERCADO_PAGO_ACCESS_TOKEN });
      const payment = await client.payment.get({ id: paymentId });
      console.log('Detalles del pago:', payment.data); // Accedemos a payment.data para ver la información del pago

      // **PASO 3: Actualizar Google Sheets**
      if (payment.data.status === 'approved') {
        // Aquí iría tu lógica para interactuar con la API de Google Sheets
        console.log(`Pago ${paymentId} aprobado. Actualizando Google Sheets...`);
        // Ejemplo de la información que podrías usar:
        // console.log('Información relevante del pago:', {
        //   id: payment.data.id,
        //   status: payment.data.status,
        //   amount: payment.data.transaction_amount,
        //   payerEmail: payment.data.payer.email,
        //   // ... otros campos que necesites
        // });
      } else {
        console.log(`El pago ${paymentId} no fue aprobado o hubo un problema. Estado: ${payment.data.status}`);
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