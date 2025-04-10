import { Memberstack } from '@memberstack/admin';

const memberstack = new Memberstack({
  secretKey: process.env.MEMBERSTACK_SECRET_KEY,
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { memberId, newMetadata } = req.body;

    if (!memberId || !newMetadata || typeof newMetadata !== 'object') {
      return res.status(400).json({ error: 'Se requieren el ID del miembro y la nueva metadata (un objeto).' });
    }

    try {
      const { data: updatedMember } = await memberstack.members.update({
        id: memberId,
        data: {
          metaData: newMetadata,
        },
      });

      return res.status(200).json({ message: 'Metadata del miembro actualizada exitosamente.', metadata: updatedMember.metaData });
    } catch (error) {
      console.error('Error al actualizar la metadata del miembro:', error);
      return res.status(500).json({ error: 'Error al actualizar la metadata del miembro.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}