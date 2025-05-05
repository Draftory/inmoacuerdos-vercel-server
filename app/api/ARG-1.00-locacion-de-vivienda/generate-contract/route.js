import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";

// --- Ruta al archivo de la plantilla DOCX ---
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "app",
  "Templates",
  "1.00 - Contrato de Locación de Vivienda - Template.docx"
);

export async function POST(request) {
  console.log("[/api/process-template] - Recibida una solicitud POST");
  try {
    const requestBody = await request.json();
    console.log(
      "[/api/process-template] - Cuerpo de la solicitud:",
      requestBody
    );
    const { placeholders } = requestBody;

    if (!placeholders || typeof placeholders !== "object") {
      console.error(
        '[/api/process-template] - Error: Objeto "placeholders" inválido o faltante en el cuerpo de la solicitud.'
      );
      return NextResponse.json(
        {
          error:
            'Se requiere un objeto "placeholders" en el cuerpo de la solicitud.',
        },
        { status: 400 }
      );
    }

    console.log(
      "[/api/process-template] - Placeholders recibidos:",
      placeholders
    );

    // --- Leer el contenido de la plantilla DOCX ---
    try {
      console.log(
        "[/api/process-template] - Intentando leer el archivo de plantilla:",
        TEMPLATE_PATH
      );
      const templateBuffer = await fs.readFile(TEMPLATE_PATH);
      console.log(
        "[/api/process-template] - Archivo de plantilla leído exitosamente."
      );
      const { value: templateHTML } = await mammoth.convertToHtml({
        buffer: templateBuffer,
      });
      console.log(
        "[/api/process-template] - Plantilla DOCX convertida a HTML."
      );
      let processedHTML = templateHTML;

      console.log(
        "[/api/process-template] - Contenido HTML inicial (antes de reemplazar):",
        processedHTML.substring(0, 200) + "..."
      ); // Mostrar solo los primeros 200 caracteres

      // --- Reemplazar los placeholders en el HTML ---
      let replacements = 0;
      for (const placeholder in placeholders) {
        const value = placeholders[placeholder];
        const regex = new RegExp(
          placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
          "g"
        );
        const originalLength = processedHTML.length;
        processedHTML = processedHTML.replace(regex, value || "");
        if (processedHTML.length > originalLength) {
          replacements++;
        }
      }

      console.log(
        "[/api/process-template] - Reemplazos realizados:",
        replacements
      );
      console.log(
        "[/api/process-template] - Contenido HTML procesado (después de reemplazar):",
        processedHTML.substring(0, 200) + "..."
      ); // Mostrar solo los primeros 200 caracteres

      return NextResponse.json({ processedHTML }, { status: 200 });
    } catch (error) {
      console.error(
        "[/api/process-template] - Error al leer o procesar la plantilla:",
        error
      );
      return NextResponse.json(
        { error: `Error al leer o procesar la plantilla: ${error.message}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error(
      "[/api/process-template] - Error al procesar la solicitud:",
      error
    );
    return NextResponse.json(
      { error: error.message || "Ocurrió un error al procesar la solicitud." },
      { status: 500 }
    );
  }
}
