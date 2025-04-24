// app/api/test-email/route.js
import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = "noresponder@inmoacuerdos.com"; // Define la dirección de envío aquí

export async function POST(req) {
  try {
    const { to, subject, body } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: "Faltan parámetros: to, subject o body." },
        { status: 400 }
      );
    }

    const data = await resend.emails.send({
      from: fromEmail, // Usamos la variable definida arriba
      to: to,
      subject: subject,
      html: `<p>${body}</p>`,
    });

    return NextResponse.json(
      { message: "Correo electrónico enviado exitosamente!", data },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al enviar el correo electrónico:", error);
    return NextResponse.json(
      {
        error: "Error al enviar el correo electrónico con Resend.",
        details: error,
      },
      { status: 500 }
    );
  }
}

export async function GET(req) {
  return NextResponse.json(
    {
      message: "Este endpoint solo acepta solicitudes POST para enviar emails.",
    },
    { status: 405 }
  );
}
