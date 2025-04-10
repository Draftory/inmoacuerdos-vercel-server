// app/api/Memberstack/Tokens/getMemberMetadata/route.js
import { Memberstack } from '@memberstack/admin';
import { NextResponse } from 'next/server';

// Inicializa Memberstack fuera del handler para que se ejecute solo una vez por cold start
const memberstack = new Memberstack({
  secretKey: process.env.MEMBERSTACK_SECRET_KEY,
});

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get('memberId');

  if (!memberId) {
    return NextResponse.json({ error: 'Se requiere el ID del miembro.' }, { status: 400 });
  }

  try {
    const { data: member } = await memberstack.members.retrieve({
      id: memberId,
    });

    if (!member) {
      return NextResponse.json({ error: 'Miembro no encontrado.' }, { status: 404 });
    }

    return NextResponse.json({ metadata: member.metaData });
  } catch (error) {
    console.error('Error al obtener la metadata del miembro:', error);
    return NextResponse.json({ error: 'Error al obtener la metadata del miembro.' }, { status: 500 });
  }
}