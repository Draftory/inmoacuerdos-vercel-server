import { createHmac } from 'node:crypto';

export default async function handler(req, res) {
  // Solo procesar peticiones POST
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // Obtener los headers
  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];

  // Obtener el data.id de los query params
  const dataID = req.query['data.id'];

  if (!xSignature || !xRequestId || !dataID) {
    console.error('Faltan headers o data.id');
    return res.status(400).send('Missing required headers or data.id');
  }

  // Separando el x-signature en partes
  const parts = xSignature.split(',');
  let ts;
  let hash;

  parts.forEach(part => {
    const [key, value] = part.split('=');
    if (key && value) {
      const trimmedKey = key.trim();
      const trimmedValue = value.trim();
      if (trimmedKey === 'ts') {
        ts = trimmedValue;
      } else if (trimmedKey === 'v1') {
        hash = trimmedValue;
      }
    }
  });

  if (!ts || !hash) {
    console.error('No se pudieron extraer ts o v1 de x-signature');
    return res.status(400).send('Could not extract ts or v1 from x-signature');
  }

  // Obtener la clave secreta de las variables de entorno
  const secret = process.env.MERCADO_PAGO_WEBHOOK_ACCESS_TOKEN;

  if (!secret) {
    console.error('La clave secreta del webhook de Mercado Pago no está configurada como variable de entorno.');
    return res.status(500).send('Mercado Pago webhook secret key not configured.');
  }

  // Generar el manifest string
  const manifest = `id:${dataID};request-id:${xRequestId};ts:${ts};`;

  // Crear un HMAC signature
  const hmac = createHmac('sha256', secret);
  hmac.update(manifest);
  const sha = hmac.digest('hex');

  // Verificar la firma
  if (sha === hash) {
    console.log("HMAC verification passed");
    // Aquí puedes procesar la información del webhook (req.body) de forma segura
    console.log("Webhook body:", req.body);
    return res.status(200).send('Webhook recibido y verificado');
  } else {
    console.error("HMAC verification failed");
    return res.status(401).send('HMAC verification failed');
  }
}