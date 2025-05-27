import { createClient } from '@supabase/supabase-js';
import { NextResponse } from "next/server";
import { logger } from '../../utils/logger';
import { interactWithWebflow } from '../../utils/apiUtils';

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

export async function OPTIONS(req) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return new NextResponse(null, {
    status: 204,
    headers: headers,
  });
}

export async function POST(req) {
  const origin = req.headers.get("origin");
  const responseHeaders = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  let contractID;
  try {
    const formObject = await req.json();
    contractID = formObject.contractID;
    const { status, ...formData } = formObject;

    if (!formObject || typeof formObject !== "object" || Object.keys(formObject).length === 0) {
      logger.error('Datos inválidos', contractID);
      throw new Error("Invalid or missing data in the request body.");
    }

    const editLink = `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`;

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Buscar si el contrato ya existe
    const { data: existingContract } = await supabase
      .from('1.00 - Contrato de Locación de Vivienda - Database')
      .select('*')
      .eq('contractID', contractID)
      .eq('MemberstackID', formObject.MemberstackID)
      .single();

    const contractData = {
      ...formObject,
      Editlink: editLink,
      updated_at: new Date().toISOString()
    };

    let result;
    if (existingContract) {
      // Actualizar contrato existente
      result = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .update(contractData)
        .eq('contractID', contractID)
        .eq('MemberstackID', formObject.MemberstackID);
    } else {
      // Crear nuevo contrato
      result = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .insert([{ ...contractData, created_at: new Date().toISOString() }]);
    }

    if (result.error) {
      throw result.error;
    }

    // Actualizar Webflow si es necesario
    const webflowApiToken = process.env.WEBFLOW_API_TOKEN;
    if (webflowApiToken && process.env.WEBFLOW_USER_COLLECTION_ID) {
      const webflowUpdateResult = await interactWithWebflow(
        contractID,
        webflowApiToken,
        process.env.WEBFLOW_USER_COLLECTION_ID,
        Object.keys(contractData),
        Object.values(contractData),
        formData.pdffile || null,
        formData.docfile || null,
        Object.values(contractData),
        null, // Ya no necesitamos sheets
        null, // Ya no necesitamos spreadsheetId
        null, // Ya no necesitamos sheetName
        null, // Ya no necesitamos rowIndex
        Object.keys(contractData).indexOf("Editlink")
      );

      if (webflowUpdateResult.success) {
        logger.info('Webflow actualizado exitosamente', contractID);
      } else {
        logger.error(`Error actualizando Webflow: ${webflowUpdateResult.error}`, contractID);
      }
    }

    logger.info('Proceso completado', contractID);
    return NextResponse.json(
      { message: "Contract data processed successfully." },
      { status: 200, headers: responseHeaders }
    );
  } catch (error) {
    logger.error(`Error: ${error.message}`, contractID);
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: responseHeaders }
    );
  }
}
