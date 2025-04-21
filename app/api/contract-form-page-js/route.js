import { NextResponse } from "next/server";
import fs from "fs/promises"; // Using the promises API for cleaner async operations
import path from "path";

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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  return new NextResponse(null, {
    status: 204,
    headers: headers,
  });
}

export async function GET(req) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : allowedOrigins[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "text/javascript", // Important: Set content type to JavaScript
  };

  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "frontend-js-scripts",
      "editor-documentos-form-js.js"
    );

    const javascriptContent = await fs.readFile(filePath, "utf-8");

    // Embed the JavaScript content within <script> tags (though setting Content-Type might be enough)
    // const responseContent = `<script>\n${javascriptContent}\n</script>`;
    const responseContent = javascriptContent; // Serving directly as JavaScript

    return new NextResponse(responseContent, {
      status: 200,
      headers: headers,
    });
  } catch (error) {
    console.error("Error reading JavaScript file:", error);
    return new NextResponse(
      JSON.stringify({ error: "Failed to load JavaScript" }),
      {
        status: 500,
        headers: headers,
      }
    );
  }
}
