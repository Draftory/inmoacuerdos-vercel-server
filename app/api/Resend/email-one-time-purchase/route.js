// app/api/test-email/route.js
import { Resend } from "resend";
import { NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);
const senderName = "InmoAcuerdos"; // Define el nombre del remitente
const fromEmail = `"${senderName}" <noresponder@inmoacuerdos.com>`; // Formato con nombre

export async function POST(req) {
  try {
    const { to, subject, name, linkPDF, linkDOC, contractTypeDescription } =
      await req.json();

    if (!to || !subject || !linkPDF || !linkDOC || !contractTypeDescription) {
      return NextResponse.json(
        {
          error:
            "Faltan parámetros obligatorios: to, subject, linkPDF, linkDOC o contractTypeDescription.",
        },
        { status: 400 }
      );
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${contractTypeDescription}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f9fafb;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.05);
          }
          .header {
            text-align: center;
            padding-bottom: 20px;
            border-bottom: 1px solid #e0e0e0;
          }
          .header a { /* Estilos para el enlace del logo */
            text-decoration: none;
            display: inline-block; /* Para que el bloque ocupe el espacio de la imagen */
          }
          .header img {
            max-height: 60px;
            margin-bottom: 10px;
          }
          .header h1 {
            font-size: 24px;
            margin: 0;
            color: #2d3748;
          }
          .content {
            margin-top: 20px;
            color: #4a5568;
            font-size: 16px;
            line-height: 1.6;
          }
          .btn {
            display: inline-block;
            margin: 20px 10px 0 0;
            padding: 12px 20px;
            border-radius: 5px;
            background-color: #0055d4;
            color: #ffffff !important;
            text-decoration: none;
            font-weight: bold;
          }
          .footer {
            margin-top: 40px;
            font-size: 13px;
            color: #a0aec0;
            text-align: center;
          }
          .contact {
            margin-top: 30px;
            font-size: 14px;
            color: #4a5568;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <a href="https://inmoacuerdos.com" target="_blank" rel="noopener noreferrer">
              <img src="https://ms-application-assets.s3.amazonaws.com/images/app_clk8u8rs900690tjx3j00e86h/675059-logo.png" alt="InmoAcuerdos Logo">
            </a>
            <h1>¡Gracias por usar InmoAcuerdos!</h1>
          </div>
          <div class="content">
            <p>Hola ${name ? name : "Estimado/a usuario"},</p>
            <p>Hemos generado tu ${contractTypeDescription} con éxito. Podés descargarlo en los siguientes formatos:</p>

            <a href="${linkPDF}" class="btn">📄 Descargar en PDF</a>
            <a href="${linkDOC}" class="btn">📝 Descargar en Word</a>

            <p>Recordá revisar el contrato antes de firmarlo.</p>

            <div class="contact">
              Si tenés alguna duda, no dudes en escribirnos a <a href="mailto:hola@inmoacuerdos.com">hola@inmoacuerdos.com</a>. Estamos para ayudarte 😊
            </div>

            <p>¡Gracias por confiar en nosotros!</p>
            <p>— El equipo de InmoAcuerdos</p>
          </div>
          <div class="footer">
            © 2025 InmoAcuerdos · <a href="https://inmoacuerdos.com" style="color:#a0aec0;">inmoacuerdos.com</a>
          </div>
        </div>
      </body>
      </html>
    `;

    const data = await resend.emails.send({
      from: fromEmail,
      to: to,
      subject: subject,
      html: emailHtml,
    });

    return NextResponse.json(
      { message: "Correo electrónico enviado exitosamente!" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error al enviar el correo electrónico");
    return NextResponse.json(
      {
        error: "Error al enviar el correo electrónico con Resend.",
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
