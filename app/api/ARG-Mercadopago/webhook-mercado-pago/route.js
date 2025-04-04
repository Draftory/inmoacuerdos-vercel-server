export default async function handler(req, res) {
  if (req.method === 'GET') {
    const payment = req.query;
    console.log({ payment });
    res.status(200).json({ received_via_query: true, data: payment });
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}