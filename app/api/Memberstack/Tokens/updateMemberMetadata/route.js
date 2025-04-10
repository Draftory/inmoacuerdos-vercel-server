import { Memberstack } from '@memberstack/admin';
import { NextResponse } from 'next/server';

const memberstack = new Memberstack({
  secretKey: process.env.MEMBERSTACK_SECRET_KEY,
});

export async function POST(request) {
  try {
    const { memberId, newMetadata } = await request.json();

    if (!memberId || !newMetadata || typeof newMetadata !== 'object') {
      return NextResponse.json({ error: 'Se requieren el ID del miembro y la nueva metadata (un objeto).' }, { status: 400 });
    }

    const { data: updatedMember } = await memberstack.members.update({
      id: memberId,
      data: {
        metaData: newMetadata,
      },
    });

    return NextResponse.json({ message: 'Metadata del miembro actualizada exitosamente.', metadata: updatedMember.metaData });
  } catch (error) {
    console.error('Error al actualizar la metadata del miembro:', error);
    return NextResponse.json({ error: 'Error al actualizar la metadata del miembro.' }, { status: 500 });
  }
}