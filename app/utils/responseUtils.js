// utils/responseUtils.js
import { NextResponse } from "next/server";

export function createErrorResponse(message, status = 500, headers = {}) {
  console.error(`API Error (${status}): ${message}`);
  return new NextResponse(JSON.stringify({ error: message }), {
    status: status,
    headers: headers, // Aplicar las cabeceras
  });
}

export function createSuccessResponse(data, status = 200, headers = {}) {
  return new NextResponse(JSON.stringify(data), {
    status: status,
    headers: headers, // Aplicar las cabeceras
  });
}
