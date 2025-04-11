// app/api/Memberstack/Tokens/removeMemberFromPlan/route.js
import memberstackAdmin from "@memberstack/admin";
import { NextResponse } from 'next/server';

// Inicializa Memberstack fuera del handler
const memberstack = memberstackAdmin.init(process.env.MEMBERSTACK_SECRET_KEY);

export async function POST(request) {
  try {
    const { memberId, planId } = await request.json();

    if (!memberId || !planId) {
      return NextResponse.json({ error: 'Se requieren el ID del miembro y el ID del plan.' }, { status: 400 });
    }

    await memberstack.members.removeFreePlan({ // Usamos removeFreePlan para cualquier plan
      id: memberId,
      data: {
        planId: planId,
      },
    });

    return NextResponse.json({ message: 'Miembro removido del plan exitosamente.' });

  } catch (error) {
    console.error('Error al remover el miembro del plan:', error);
    return NextResponse.json({ error: 'Error al remover el miembro del plan.' }, { status: 500 });
  }
}