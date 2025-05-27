import { createClient } from '@supabase/supabase-js';
import { NextResponse } from "next/server";
import { logger } from '../../utils/logger';
import { interactWithWebflow, sendEmailNotification } from '../../utils/apiUtils';

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

export async function POST(req) {
  let headers = {
    "Access-Control-Allow-Origin": allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const origin = req.headers.get("origin");
    headers = {
      "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0],
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const body = await req.json();
    const { contractID, formData } = body;

    // Solo validamos que exista el contractID y formData
    if (!contractID || !formData) {
      logger.error('Datos incompletos en la solicitud');
      return NextResponse.json(
        { error: "Missing required fields: contractID and formData" },
        { status: 400, headers }
      );
    }

    // Preparar los datos para Supabase
    const supabaseData = {
      contractID,
      Status: "Borrador",
      Timestamp: new Date().toISOString(),
      MemberstackID: formData.MemberstackID || null,
      nombreLocadorPF1: formData.nombreLocadorPF1 || null,
      nombreLocadorPF2: formData.nombreLocadorPF2 || null,
      nombreLocadorPF3: formData.nombreLocadorPF3 || null,
      denominacionLegalLocadorPJ1: formData.denominacionLegalLocadorPJ1 || null,
      denominacionLegalLocadorPJ2: formData.denominacionLegalLocadorPJ2 || null,
      denominacionLegalLocadorPJ3: formData.denominacionLegalLocadorPJ3 || null,
      nombreLocatarioPF1: formData.nombreLocatarioPF1 || null,
      nombreLocatarioPF2: formData.nombreLocatarioPF2 || null,
      nombreLocatarioPF3: formData.nombreLocatarioPF3 || null,
      denominacionLegalLocatarioPJ1: formData.denominacionLegalLocatarioPJ1 || null,
      denominacionLegalLocatarioPJ2: formData.denominacionLegalLocatarioPJ2 || null,
      denominacionLegalLocatarioPJ3: formData.denominacionLegalLocatarioPJ3 || null,
      domicilioInmuebleLocado: formData.domicilioInmuebleLocado || null,
      ciudadInmuebleLocado: formData.ciudadInmuebleLocado || null,
      hiddenInputLocacionFechaInicio: formData.hiddenInputLocacionFechaInicio || null,
      hiddenInputLocacionFechaTermino: formData.hiddenInputLocacionFechaTermino || null,
      Contrato: formData.Contrato || null,
      Editlink: `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`
    };

    // Si hay URLs de PDF o DOC, las agregamos
    if (body.pdfUrl) supabaseData.PDFFile = body.pdfUrl;
    if (body.docUrl) supabaseData.DOCFile = body.docUrl;

    // Insertar en Supabase
    const { data, error } = await supabase
      .from('1.00 - Contrato de Locación de Vivienda - Database')
      .insert([supabaseData])
      .select();

    if (error) {
      logger.error(`Error Supabase: ${error.message}`);
      return NextResponse.json(
        { error: "Error saving to database" },
        { status: 500, headers }
      );
    }

    // Solo interactuamos con Webflow si hay URLs de documentos
    if (body.pdfUrl && body.docUrl) {
      const webflowResult = await interactWithWebflow(
        contractID,
        process.env.WEBFLOW_API_TOKEN,
        process.env.WEBFLOW_COLLECTION_ID,
        Object.keys(formData),
        Object.values(formData),
        body.pdfUrl,
        body.docUrl,
        Object.values(formData),
        null,
        null,
        null,
        null,
        -1
      );

      if (!webflowResult.success) {
        logger.error(`Error Webflow: ${webflowResult.error}`);
        return NextResponse.json(
          { error: "Error updating Webflow" },
          { status: 500, headers }
        );
      }
    }

    // Solo enviamos emails si hay URLs de documentos
    if (body.pdfUrl && body.docUrl) {
      await sendEmailNotification(
        formData.memberEmail || null,
        formData.guestEmail || null,
        body.pdfUrl,
        body.docUrl,
        Object.values(formData),
        Object.keys(formData)
      );
    }

    return NextResponse.json(
      { 
        success: true, 
        data: data[0]
      },
      { headers }
    );

  } catch (error) {
    logger.error(`Error: ${error.message}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers }
    );
  }
}

export async function OPTIONS(req) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return new NextResponse(null, { headers });
}
