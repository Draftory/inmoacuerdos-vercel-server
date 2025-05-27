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
    const { contractID, pdfUrl, docUrl, formData } = body;

    if (!contractID || !pdfUrl || !docUrl || !formData) {
      logger.error('Datos incompletos en la solicitud');
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers }
      );
    }

    // Preparar los datos para Supabase
    const supabaseData = {
      contractID,
      PDFFile: pdfUrl,
      DOCFile: docUrl,
      Status: "Final",
      Timestamp: new Date().toISOString(),
      MemberstackID: formData.MemberstackID,
      nombreLocadorPF1: formData.nombreLocadorPF1,
      nombreLocadorPF2: formData.nombreLocadorPF2,
      nombreLocadorPF3: formData.nombreLocadorPF3,
      denominacionLegalLocadorPJ1: formData.denominacionLegalLocadorPJ1,
      denominacionLegalLocadorPJ2: formData.denominacionLegalLocadorPJ2,
      denominacionLegalLocadorPJ3: formData.denominacionLegalLocadorPJ3,
      nombreLocatarioPF1: formData.nombreLocatarioPF1,
      nombreLocatarioPF2: formData.nombreLocatarioPF2,
      nombreLocatarioPF3: formData.nombreLocatarioPF3,
      denominacionLegalLocatarioPJ1: formData.denominacionLegalLocatarioPJ1,
      denominacionLegalLocatarioPJ2: formData.denominacionLegalLocatarioPJ2,
      denominacionLegalLocatarioPJ3: formData.denominacionLegalLocatarioPJ3,
      domicilioInmuebleLocado: formData.domicilioInmuebleLocado,
      ciudadInmuebleLocado: formData.ciudadInmuebleLocado,
      hiddenInputLocacionFechaInicio: formData.hiddenInputLocacionFechaInicio,
      hiddenInputLocacionFechaTermino: formData.hiddenInputLocacionFechaTermino,
      Contrato: formData.Contrato,
      Editlink: `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`
    };

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

    // Interactuar con Webflow
    const webflowResult = await interactWithWebflow(
      contractID,
      process.env.WEBFLOW_API_TOKEN,
      process.env.WEBFLOW_COLLECTION_ID,
      Object.keys(formData),
      Object.values(formData),
      pdfUrl,
      docUrl,
      Object.values(formData),
      null, // sheets ya no es necesario
      null, // spreadsheetId ya no es necesario
      null, // sheetName ya no es necesario
      null, // rowIndex ya no es necesario
      -1 // editlinkColumnIndex ya no es necesario
    );

    if (!webflowResult.success) {
      logger.error(`Error Webflow: ${webflowResult.error}`);
      return NextResponse.json(
        { error: "Error updating Webflow" },
        { status: 500, headers }
      );
    }

    // Enviar notificaciones por email
    await sendEmailNotification(
      formData.memberEmail || null,
      formData.guestEmail || null,
      pdfUrl,
      docUrl,
      Object.values(formData),
      Object.keys(formData)
    );

    return NextResponse.json(
      { 
        success: true, 
        data: data[0],
        webflow: webflowResult.data 
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
