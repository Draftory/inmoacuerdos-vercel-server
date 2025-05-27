import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { logger } from '../../utils/logger';

const allowedOrigins = [
    'https://www.inmoacuerdos.com',
    'https://inmoacuerdos.webflow.io'
];

export async function OPTIONS(req) {
    const origin = req.headers.get('origin');
    const headers = {
        'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    return new NextResponse(null, {
        status: 204,
        headers: headers,
    });
}

export async function POST(req) {
    const origin = req.headers.get('origin');
    const headers = {
        'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : allowedOrigins[0],
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    try {
        const requestBody = await req.json();
        const contractID = requestBody.contractID;
        const memberstackID = requestBody.memberstackID;

        if (!contractID || !memberstackID) {
            logger.error('Datos requeridos faltantes', contractID);
            return new NextResponse(JSON.stringify({ error: 'contractID and memberstackID are required' }), {
                status: 400,
                headers: headers,
            });
        }

        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );

        // Buscar en Supabase
        const { data, error } = await supabase
            .from('1.00 - Contrato de Locación de Vivienda - Database')
            .select('*')
            .eq('contractID', contractID)
            .eq('MemberstackID', memberstackID)
            .single();

        if (error) {
            logger.error(`Error Supabase: ${error.message}`, contractID);
            return new NextResponse(JSON.stringify({ error: 'Error querying database' }), {
                status: 500,
                headers: headers,
            });
        }

        if (!data) {
            logger.error('Fila no encontrada', contractID);
            return new NextResponse(JSON.stringify({ error: 'Row not found' }), {
                status: 404,
                headers: headers,
            });
        }

        logger.info('Datos recuperados', contractID);
        return new NextResponse(JSON.stringify(data), {
            status: 200,
            headers: headers,
        });
    } catch (error) {
        logger.error(`Error: ${error.message}`, contractID);
        return new NextResponse(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: headers,
        });
    }
}