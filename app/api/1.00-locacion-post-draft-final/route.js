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

    // Preparar los datos para Supabase - incluir todos los campos del formulario
    const supabaseData = {
      // Primero incluimos todos los campos del formulario
      ...formData,
      // Luego sobrescribimos o aseguramos los campos específicos
      contractID,
      timestamp: new Date().toISOString(),
      MemberstackID: formData.MemberstackID || null,
      Editlink: `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`
    };

    // Limpiar valores undefined o null
    Object.keys(supabaseData).forEach(key => {
      if (supabaseData[key] === undefined || supabaseData[key] === "") {
        supabaseData[key] = null;
      }
    });

    // Si hay URLs de PDF o DOC, las agregamos
    if (formData.PDFFile) {
      supabaseData.PDFFile = formData.PDFFile;
    }
    if (formData.DOCFile) {
      supabaseData.DOCFile = formData.DOCFile;
    }

    // Insertar o actualizar en Supabase
    try {
      // Primero obtenemos la estructura de la tabla
      const { data: tableInfo, error: tableError } = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .select('*')
        .limit(1);

      if (tableError) {
        throw tableError;
      }

      // Obtenemos las columnas existentes en la tabla
      const existingColumns = Object.keys(tableInfo[0] || {});

      // Filtramos los datos para incluir solo las columnas que existen en la tabla
      const filteredData = Object.keys(supabaseData).reduce((acc, key) => {
        if (existingColumns.includes(key)) {
          acc[key] = supabaseData[key];
        }
        return acc;
      }, {});

      // Verificamos si el registro existe
      const { data: existingRecord, error: checkError } = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .select('draftVersion')
        .eq('contractID', contractID)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 es el error cuando no se encuentra el registro
        throw checkError;
      }

      let result;
      if (existingRecord) {
        // Si existe, actualizamos el registro
        const { data, error } = await supabase
          .from('1.00 - Contrato de Locación de Vivienda - Database')
          .update({
            ...filteredData,
            draftVersion: (existingRecord.draftVersion || 0) + 1
          })
          .eq('contractID', contractID)
          .select();

        if (error) throw error;
        result = data;
      } else {
        // Si no existe, creamos uno nuevo
        const { data, error } = await supabase
          .from('1.00 - Contrato de Locación de Vivienda - Database')
          .insert([{
            ...filteredData,
            draftVersion: 1
          }])
          .select();

        if (error) throw error;
        result = data;
      }

      // Siempre interactuamos con Webflow
      const webflowResult = await interactWithWebflow(
        contractID,
        process.env.WEBFLOW_API_TOKEN,
        process.env.WEBFLOW_USER_COLLECTION_ID,
        Object.keys(formData),
        Object.values(formData),
        formData.PDFFile || null,
        formData.DOCFile || null,
        Object.values(formData),
        null,  // sheets
        null,  // spreadsheetId
        null,  // sheetName
        -1,    // rowIndex
        Object.keys(formData).indexOf('Editlink')  // editlinkColumnIndex
      );

      if (!webflowResult.success) {
        return NextResponse.json(
          { error: "Error updating Webflow", details: webflowResult.error },
          { status: 500, headers }
        );
      }

      return NextResponse.json(
        { 
          success: true, 
          data: result[0]
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
