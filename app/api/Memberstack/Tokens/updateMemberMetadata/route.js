// app/api/Memberstack/Tokens/updateMemberMetadata/route.js
import memberstackAdmin from "@memberstack/admin";
import { NextResponse } from 'next/server';

// Inicializa Memberstack fuera del handler
const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);

export async function POST(request) {
  try {
    const { memberId, newMetadata } = await request.json();

    if (!memberId || !newMetadata || typeof newMetadata !== 'object' || typeof newMetadata.tokens === 'undefined') {
      return NextResponse.json({ error: 'Se requieren el ID del miembro y la nueva metadata con la clave "tokens".' }, { status: 400 });
    }

    // Obtener la información actual del miembro para acceder a la metadata actual
    const { data: currentMember } = await memberstack.members.retrieve({
      id: memberId,
    });

    if (!currentMember) {
      return NextResponse.json({ error: 'Miembro no encontrado para actualizar los tokens.' }, { status: 404 });
    }

    const currentTokens = parseInt(currentMember.metaData?.tokens || 0, 10);
    const amountToChange = parseInt(newMetadata.tokens, 10); // Debería ser -1 desde App Script

    if (isNaN(currentTokens) || isNaN(amountToChange)) {
      return NextResponse.json({ error: 'Los valores de tokens actual o a cambiar no son números válidos.' }, { status: 400 });
    }

    const updatedTokens = currentTokens + amountToChange;

    const { data: updatedMember } = await memberstack.members.update({
      id: memberId,
      data: {
        metaData: {
          ...currentMember.metaData, // Mantener otras claves de metadata
          tokens: updatedTokens,
        },
      },
    });

    return NextResponse.json({ message: 'Metadata del miembro actualizada exitosamente.', metadata: updatedMember.metaData });
  } catch (error) {
    console.error('Error al actualizar la metadata del miembro:', error);
    return NextResponse.json({ error: 'Error al actualizar la metadata del miembro.' }, { status: 500 });
  }
}