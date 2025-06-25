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

    // El body viene como array, tomamos el primer elemento
    const formData = Array.isArray(body) ? body[0] : body;
    const contractID = formData.contractID;
    const memberstackID = formData.MemberstackID;

    logger.info(`contractID: ${contractID}`);
    logger.info(`memberstackID: ${memberstackID}`);

    // Solo validamos que exista el contractID
    if (!contractID) {
      logger.error('Datos incompletos en la solicitud', {
        hasContractID: !!contractID,
        hasMemberstackID: !!memberstackID
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
      MemberstackID: memberstackID || null,  // Aseguramos que sea null si no existe
      Editlink: `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`
    };

    // Limpiar valores undefined o null
    Object.keys(supabaseData).forEach(key => {
      if (supabaseData[key] === undefined || supabaseData[key] === "") {
        supabaseData[key] = null;
      }
    });

    logger.info('Datos preparados para Supabase:', {
      contractID,
      memberstackID,
      hasMemberstackID: !!supabaseData.MemberstackID,
      dataKeys: Object.keys(supabaseData)
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
      logger.info('Obteniendo estructura de la tabla');
      const { data: tableInfo, error: tableError } = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .select('*')
        .limit(1);

      if (tableError) {
        logger.error('Error al obtener estructura de la tabla:', {
          error: tableError,
          code: tableError.code,
          message: tableError.message,
          details: tableError.details
        });
        throw tableError;
      }

      // Obtenemos las columnas existentes en la tabla
      const existingColumns = Object.keys(tableInfo[0] || {});
      logger.info('Columnas existentes:', existingColumns.length);

      // Log missing keys in Supabase (input fields not present in Supabase columns)
      const inputKeys = Object.keys(supabaseData);
      const missingInSupabase = inputKeys.filter(key => !existingColumns.includes(key));
      logger.warn('Campos del input que NO existen en Supabase:', missingInSupabase);

      // Log missing keys in input (Supabase columns not present in input fields)
      const missingInInput = existingColumns.filter(key => !inputKeys.includes(key));
      logger.warn('Columnas de Supabase que NO están en el input:', missingInInput, '⚠️ Recuerda: si no seleccionas radios o checkboxes en el formulario, esos campos no se envían y aparecerán aquí.');

      // Filtramos los datos para incluir solo las columnas que existen en la tabla
      const filteredData = Object.keys(supabaseData).reduce((acc, key) => {
        if (existingColumns.includes(key)) {
          acc[key] = supabaseData[key];
        }
        return acc;
      }, {});

      // Verificamos si el registro existe
      logger.info('Verificando registro existente para contractID:', contractID);
      const { data: existingRecord, error: checkError } = await supabase
        .from('1.00 - Contrato de Locación de Vivienda - Database')
        .select('draftVersion, Editlink')
        .eq('contractID', contractID)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        logger.error('Error al verificar registro existente:', {
          error: checkError,
          code: checkError.code,
          message: checkError.message,
          details: checkError.details
        });
        throw checkError;
      }

      let result;
      if (existingRecord) {
        logger.info('Actualizando registro existente');
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
          logger.error('Error al actualizar registro:', {
            error,
            code: error.code,
            message: error.message,
            details: error.details
          });
          throw error;
        }
        result = data;
      } else {
        logger.info('Creando nuevo registro con datos:', {
          contractID,
          memberstackID,
          hasMemberstackID: !!filteredData.MemberstackID,
          filteredDataKeys: Object.keys(filteredData),
          filteredDataValues: Object.values(filteredData),
          tableName: '1.00 - Contrato de Locación de Vivienda - Database'
        });

        // Log the exact data being sent to Supabase
        const insertData = {
          ...filteredData,
          draftVersion: 1,
          Editlink: `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`
        };
        logger.info('Datos a insertar en Supabase:', {
          data: JSON.stringify(insertData, null, 2),
          keys: Object.keys(insertData),
          values: Object.values(insertData)
        });

        const { data, error } = await supabase
          .from('1.00 - Contrato de Locación de Vivienda - Database')
          .insert([insertData])
          .select();

        if (error) {
          logger.error('Error al crear nuevo registro:', {
            error: JSON.stringify(error),
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
            data: JSON.stringify(insertData),
            memberstackID: memberstackID,
            hasMemberstackID: !!insertData.MemberstackID,
            tableName: '1.00 - Contrato de Locación de Vivienda - Database',
            operation: 'insert',
            filteredDataKeys: Object.keys(insertData),
            filteredDataValues: Object.values(insertData)
          });
          throw error;
        }
        result = data;
      }

      // Siempre interactuamos con Webflow
      const formDataKeys = Object.keys(formData);
      const formDataValues = Object.values(formData);
      
      // Asegurarnos de que el Editlink esté en los datos que se pasan a Webflow
      const editlinkValue = `https://inmoacuerdos.com/editor-documentos/1-00-locacion-de-vivienda?contractID=${contractID}`;
      if (!formData.Editlink) {
        formData.Editlink = editlinkValue;
        formDataKeys.push('Editlink');
        formDataValues.push(editlinkValue);
      }
      
      const editlinkIndex = formDataKeys.indexOf('Editlink');
      
      const webflowResult = await interactWithWebflow(
        contractID,
        process.env.WEBFLOW_API_TOKEN,
        process.env.WEBFLOW_CONTRACT_COLLECTION_ID,
        formDataKeys,
        formDataValues,
        formData.PDFFile || null,
        formData.DOCFile || null,
        formDataValues,
        null,  // sheets
        null,  // spreadsheetId
        null,  // sheetName
        -1,    // rowIndex
        editlinkIndex  // editlinkColumnIndex
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
        error: JSON.stringify(supabaseError),
        message: supabaseError.message,
        code: supabaseError.code,
        details: supabaseError.details,
        hint: supabaseError.hint,
        stack: supabaseError.stack,
        data: JSON.stringify(supabaseData)
      });
      return NextResponse.json(
        { 
          error: "Error saving to database", 
          details: supabaseError.message,
          code: supabaseError.code,
          hint: supabaseError.hint
        },
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