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
  try {
    const { placeholders } = await request.json();

    if (!placeholders || typeof placeholders !== "object") {
      return NextResponse.json(
        {
          error:
            'Se requiere un objeto "placeholders" en el cuerpo de la solicitud.',
        },
        { status: 400 }
      );
    }

    // --- Leer el contenido de la plantilla DOCX ---
    try {
      const templateBuffer = await fs.readFile(TEMPLATE_PATH);
      const { value: templateHTML } = await mammoth.convertToHtml({
        buffer: templateBuffer,
      });
      let processedHTML = templateHTML;

      // --- Reemplazar los placeholders en el HTML ---
      for (const placeholder in placeholders) {
        const value = placeholders[placeholder];
        const regex = new RegExp(
          placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
          "g"
        );
        processedHTML = processedHTML.replace(regex, value || "");
      }

      return NextResponse.json({ processedHTML }, { status: 200 });
    } catch (error) {
      console.error("Error al leer o procesar la plantilla:", error);
      return NextResponse.json(
        { error: `Error al leer o procesar la plantilla: ${error.message}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error al procesar la solicitud:", error);
    return NextResponse.json(
      { error: error.message || "Ocurrió un error al procesar la solicitud." },
      { status: 500 }
    );
  }
}
