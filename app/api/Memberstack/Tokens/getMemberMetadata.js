import { Memberstack } from '@memberstack/admin';

const memberstack = new Memberstack({
  secretKey: process.env.MEMBERSTACK_SECRET_KEY,
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { memberId } = req.query;

    if (!memberId) {
      return res.status(400).json({ error: 'Se requiere el ID del miembro.' });
    }

    try {
      const { data: member } = await memberstack.members.retrieve({
        id: memberId,
      });

      if (!member) {
        return res.status(404).json({ error: 'Miembro no encontrado.' });
      }

      return res.status(200).json({ metadata: member.metaData });
    } catch (error) {
      console.error('Error al obtener la metadata del miembro:', error);
      return res.status(500).json({ error: 'Error al obtener la metadata del miembro.' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}