export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { 'data.id': dataId, type } = req.query;

    console.log('Webhook Recibida (GET con parámetros):');
    console.log({ dataId, type });

    // Aquí puedes procesar la información
    if (type === 'payment') {
      console.log(`ID de pago recibido: ${dataId}`);
      // Agrega aquí tu lógica para el evento de pago
    }

    res.status(200).json({ received: true, method: 'GET', query_params: req.query });
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}