// api/create-preference.js
import { MercadoPagoConfig, Preference } from 'mercadopago';

const allowedOrigins = [
  'https://www.inmoacuerdos.com',
  'https://inmoacuerdos.webflow.io',
];

export default async (req, res) => {
  const origin = req.headers.origin;

  // Set CORS headers for both OPTIONS and POST requests
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Optionally set a default allowed origin or handle unauthorized requests
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]); // Or '*' for all origins (less secure)
  }

  // Handle OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Handle POST request (create preference)
  if (req.method === 'POST') {
    try {
      const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
      const preference = new Preference(client);

      const preferenceResult = await preference.create({
        items: [
          {
            title: req.body.title, // Ejemplo: 'Producto de prueba'
            quantity: Number(req.body.quantity), // Ejemplo: 1
            unit_price: Number(req.body.price), // Ejemplo: 100.50
            currency_id: 'ARS', // Cambia a tu moneda
          },
        ],
        back_urls: {
          success: 'https://www.inmoacuerdos.com/pago-exitoso', // Reemplaza con tu URL de éxito (con https://)
          failure: 'https://www.inmoacuerdos.com/pago-fallido',   // Reemplaza con tu URL de fallo (con https://)
          pending: 'https://www.inmoacuerdos.com/pago-pendiente',   // Reemplaza con tu URL de pendiente (con https://)
        },
        auto_return: 'approved', // Opcional: redirige automáticamente si el pago es aprobado
        notification_url: 'https://inmoacuerdos-vercel-server.vercel.app/api/ARG-1.00-locacion-vivienda/1.00-locacion-vivienda-mercadopago-one-time-payment/webhook-mercado-pago.js', // Opcional: URL para recibir notificaciones
      });

      res.status(200).json({ init_point: preferenceResult.init_point });
    } catch (error) {
      console.error('Error al crear la preferencia:', error);
      res.status(500).json({ error: 'Error al crear la preferencia de pago' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};