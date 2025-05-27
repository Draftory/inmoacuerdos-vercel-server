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
    logger.info('Iniciando POST request');
    
    const origin = req.headers.get("origin");
    logger.info(`Origin: ${origin}`);
    
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

    logger.info('Intentando parsear el body');
    const body = await req.json();
    logger.info('Body recibido:', JSON.stringify(body, null, 2));

    // El body viene como array, tomamos el primer elemento
    const formData = Array.isArray(body) ? body[0] : body;
    const contractID = formData.contractID;

    logger.info(`contractID: ${contractID}`);
    logger.info('formData:', JSON.stringify(formData, null, 2));

    // Solo validamos que exista el contractID
    if (!contractID) {
      logger.error('Datos incompletos en la solicitud', {
        hasContractID: !!contractID
      });
      return NextResponse.json(
        { error: "Missing required field: contractID" },
        { status: 400, headers }
      );
    }

    // Preparar los datos para Supabase - solo campos básicos
    const supabaseData = {
      contractID,
      Status: "Borrador",
      Timestamp: new Date().toISOString(),
      MemberstackID: formData.MemberstackID || null,
      Editlink: `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`,
      Contrato: "1.00 - Contrato de Locación de Vivienda"
    };

    // Limpiar valores undefined o null
    Object.keys(supabaseData).forEach(key => {
      if (supabaseData[key] === undefined) {
        supabaseData[key] = null;
      }
    });

    logger.info('Datos preparados para Supabase:', JSON.stringify(supabaseData, null, 2));

    // Si hay URLs de PDF o DOC, las agregamos
    if (formData.PDFFile) {
      logger.info(`Agregando PDF URL: ${formData.PDFFile}`);
      supabaseData.PDFFile = formData.PDFFile;
    }
    if (formData.DOCFile) {
      logger.info(`Agregando DOC URL: ${formData.DOCFile}`);
      supabaseData.DOCFile = formData.DOCFile;
    }

    // Insertar en Supabase
    logger.info('Intentando insertar en Supabase');
    try {
      // Primero obtenemos la estructura de la tabla
      const { data: tableInfo, error: tableError } = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .select('*')
        .limit(1);

      if (tableError) {
        logger.error('Error al obtener estructura de la tabla:', JSON.stringify({
          error: tableError,
          message: tableError.message
        }, null, 2));
      } else {
        const existingColumns = Object.keys(tableInfo[0] || {});
        logger.info('Estructura actual de la tabla:', JSON.stringify({
          existingColumns,
          attemptedColumns: Object.keys(supabaseData)
        }, null, 2));
      }

      // Ahora intentamos la inserción
      const { data, error } = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .insert([supabaseData])
        .select();

      if (error) {
        const existingColumns = tableInfo ? Object.keys(tableInfo[0] || {}) : [];
        const attemptedColumns = Object.keys(supabaseData);
        const missingColumns = attemptedColumns.filter(col => !existingColumns.includes(col));

        logger.error('Error Supabase:', JSON.stringify({
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          data: supabaseData,
          errorObject: error
        }, null, 2));

        logger.error('Columnas faltantes:', JSON.stringify({
          missingColumns,
          existingColumns,
          attemptedColumns
        }, null, 2));

        return NextResponse.json(
          { 
            error: "Error saving to database", 
            details: error.message,
            missingColumns,
            existingColumns,
            attemptedColumns
          },
          { status: 500, headers }
        );
      }

      logger.info('Datos insertados exitosamente en Supabase:', JSON.stringify(data, null, 2));

      // Solo interactuamos con Webflow si hay URLs de documentos
      if (formData.PDFFile && formData.DOCFile) {
        logger.info('Iniciando interacción con Webflow');
        const webflowResult = await interactWithWebflow(
          contractID,
          process.env.WEBFLOW_API_TOKEN,
          process.env.WEBFLOW_COLLECTION_ID,
          Object.keys(formData),
          Object.values(formData),
          formData.PDFFile,
          formData.DOCFile,
          Object.values(formData),
          null,
          null,
          null,
          null,
          -1
        );

        if (!webflowResult.success) {
          logger.error('Error Webflow:', webflowResult.error);
          return NextResponse.json(
            { error: "Error updating Webflow" },
            { status: 500, headers }
          );
        }
        logger.info('Webflow actualizado exitosamente');
      } else {
        logger.info('Omitiendo interacción con Webflow - no hay URLs de documentos');
      }

      // Solo enviamos emails si hay URLs de documentos
      if (formData.PDFFile && formData.DOCFile) {
        logger.info('Iniciando envío de emails');
        await sendEmailNotification(
          formData.emailMember || null,
          formData.emailGuest || null,
          formData.PDFFile,
          formData.DOCFile,
          Object.values(formData),
          Object.keys(formData)
        );
        logger.info('Emails enviados exitosamente');
      } else {
        logger.info('Omitiendo envío de emails - no hay URLs de documentos');
      }

      logger.info('Proceso completado exitosamente');
      return NextResponse.json(
        { 
          success: true, 
          data: data[0]
        },
        { headers }
      );
    } catch (supabaseError) {
      logger.error('Error al interactuar con Supabase:', {
        error: supabaseError,
        message: supabaseError.message,
        stack: supabaseError.stack,
        data: supabaseData
      });
      return NextResponse.json(
        { error: "Error saving to database", details: supabaseError.message },
        { status: 500, headers }
      );
    }

  } catch (error) {
    logger.error('Error en el proceso:', {
      message: error.message,
      stack: error.stack,
      body: error.body
    });
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
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
