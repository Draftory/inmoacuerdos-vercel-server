// utils/responseUtils.js
import { NextResponse } from "next/server";

export function createErrorResponse(message, status = 500) {
  console.error(`API Error (${status}): ${message}`);
  return new NextResponse(JSON.stringify({ error: message }), {
    status: status,
  });
}

export function createSuccessResponse(data, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status: status,
  });
}
