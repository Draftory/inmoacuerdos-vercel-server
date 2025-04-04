import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Método no permitido');
  }

  try {
    const signatureHeader = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];

    if (!signatureHeader || !requestId) {
      return res.status(400).send('Faltan headers');
    }

    const [tsPart, hashPart] = signatureHeader.split(',');
    const ts = tsPart.split('=')[1];
    const signatureFromHeader = hashPart.split('=')[1];

    const dataId = req.body?.data?.id;
    if (!dataId) {
      return res.status(400).send('Falta data.id');
    }

    const secret = process.env.MERCADO_PAGO_WEBHOOK_ACCESS_TOKEN;

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const generatedSignature = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    if (generatedSignature !== signatureFromHeader) {
      return res.status(403).send('Firma inválida');
    }

    // Firma válida, ahora buscamos el pago con el Access Token
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const paymentRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${dataId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const paymentData = await paymentRes.json();

    // Ahora podés procesar el pago como quieras
    console.log('💰 Pago recibido:', paymentData);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Error en webhook:', err);
    return res.status(500).send('Error interno');
  }
}
