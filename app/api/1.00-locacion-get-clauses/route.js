import { createClient } from '@supabase/supabase-js';
import { NextResponse } from "next/server";
import { logger } from '../../utils/logger';

// List of allowed origins
const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

export async function GET(req) {
  let headers = {
    "Access-Control-Allow-Origin": allowedOrigins[0],
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  try {
    const origin = req.headers.get("origin");
    headers = {
      "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
        ? origin
        : allowedOrigins[0],
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data: clauses, error } = await supabase
      .from('1.00 - Contrato de Locación de Vivienda - Clausulas')
      .select('*');

    if (error) {
      logger.error(`Error Supabase: ${error.message}`);
      throw error;
    }

    // Log para ver la estructura de los datos
    logger.info('Primera cláusula recibida:', JSON.stringify(clauses[0]));

    // Transformar los datos al formato esperado por el frontend
    const values = clauses.map(clause => {
      // Log para ver cada cláusula individual
      logger.info('Procesando cláusula:', JSON.stringify(clause));
      
      return [
        clause.Placeholder || '', // Nombre del placeholder
        clause["Value (inputValue)"] || '', // Valor/definición de la cláusula
        clause.Clause || '' // Contenido de la cláusula
      ];
    });

    // Log para ver el resultado final
    logger.info(`Cláusulas obtenidas: ${values.length}`);
    logger.info('Primera cláusula transformada:', JSON.stringify(values[0]));

    return NextResponse.json({ values }, { headers });
  } catch (error) {
    logger.error(`Error: ${error.message}`);
    return NextResponse.error({ status: 500, headers });
  }
}
