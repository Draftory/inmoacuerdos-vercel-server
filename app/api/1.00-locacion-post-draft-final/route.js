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
    const formData = Array.isArray(body) ? body[0] : body;
    const contractID = formData.contractID;
    const memberstackID = formData.MemberstackID;

    if (!contractID) {
      logger.error('Datos incompletos en la solicitud', contractID);
      return NextResponse.json(
        { error: "Missing required field: contractID" },
        { status: 400, headers }
      );
    }

    // Insertar o actualizar en Supabase
    try {
      const { data: tableInfo, error: tableError } = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .select('*')
        .limit(1);

      if (tableError) {
        logger.error('Error al obtener estructura de la tabla', contractID);
        throw tableError;
      }

      const existingColumns = Object.keys(tableInfo[0] || {});
      const filteredData = Object.keys(formData).reduce((acc, key) => {
        if (existingColumns.includes(key)) {
          acc[key] = formData[key];
        }
        return acc;
      }, {});

      const { data: existingRecord, error: checkError } = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .select('draftVersion, Editlink')
        .eq('contractID', contractID)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        logger.error('Error al verificar registro existente', contractID);
        throw checkError;
      }

      let result;
      if (existingRecord) {
        logger.info('Actualizando registro existente', contractID);
        const { data, error } = await supabase
          .from('1.00 - Contrato de Locación de Vivienda - Database')
          .update({
            ...filteredData,
            draftVersion: (existingRecord.draftVersion || 0) + 1,
            Editlink: formData.Editlink || existingRecord.Editlink || `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`
          })
          .eq('contractID', contractID)
          .select();

        if (error) {
          logger.error('Error al actualizar registro', contractID);
          throw error;
        }
        result = data;
      } else {
        logger.info('Creando nuevo registro', contractID);
        const insertData = {
          ...filteredData,
          draftVersion: 1,
          Editlink: `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`
        };

        const { data, error } = await supabase
          .from('1.00 - Contrato de Locación de Vivienda - Database')
          .insert([insertData])
          .select();

        if (error) {
          logger.error('Error al crear nuevo registro', contractID);
          throw error;
        }
        result = data;
      }

      logger.info('Proceso completado exitosamente', contractID);
      return NextResponse.json(result, { headers });
    } catch (error) {
      logger.error('Error en el proceso', contractID);
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers }
      );
    }
  } catch (error) {
    logger.error('Error en la solicitud');
    return NextResponse.json(
      { error: error.message },
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