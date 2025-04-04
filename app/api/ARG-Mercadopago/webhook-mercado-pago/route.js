export default async function handler(req, res) {
  if (req.method === 'POST') {
    // Leer los parámetros de consulta (aunque el método sea POST)
    const { 'data.id': dataId, type } = req.query;

    console.log('Webhook Recibida (POST con parámetros en la URL):');
    console.log({ dataId, type });

    // Aquí puedes procesar la información
    if (type === 'payment') {
      console.log(`ID de pago recibido (POST): ${dataId}`);
      // Agrega aquí tu lógica para el evento de pago recibido por POST
    }

    res.status(200).json({ received: true, method: 'POST', query_params: req.query });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}