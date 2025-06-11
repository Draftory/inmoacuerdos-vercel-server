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
      logger.error('Error al obtener cláusulas');
      throw error;
    }

    // Transformar los datos al formato esperado por el frontend
    const values = clauses.map(clause => [
      clause.Placeholder || '',
      clause["Value (inputValue)"] || '',
      clause.Clause || ''
    ]);

    logger.info(`Cláusulas obtenidas: ${values.length}`);
    return NextResponse.json({ values }, { headers });
  } catch (error) {
    logger.error('Error al procesar cláusulas');
    return NextResponse.error({ status: 500, headers });
  }
}
