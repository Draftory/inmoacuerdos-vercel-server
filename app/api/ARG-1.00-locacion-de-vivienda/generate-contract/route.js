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
const CLAUSES_API_URL =
  "https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-get-clauses";

async function fetchClauses() {
  try {
    console.log(
      "[/api/process-template] - Intentando obtener las cláusulas desde la API:",
      CLAUSES_API_URL
    );
    const response = await fetch(CLAUSES_API_URL);
    if (!response.ok) {
      console.error(
        `[/api/process-template] - Error al obtener las cláusulas: ${response.status} - ${await response.text()}`
      );
      return null;
    }
    const clausesData = await response.json();
    console.log(
      "[/api/process-template] - Cláusulas obtenidas exitosamente:",
      clausesData
    );
    return clausesData; // Asume que la API devuelve un array de objetos con 'placeholder' y 'clauseText'
  } catch (error) {
    console.error(
      "[/api/process-template] - Error al obtener las cláusulas:",
      error
    );
    return null;
  }
}

export async function POST(request) {
  console.log("[/api/process-template] - Recibida una solicitud POST");
  try {
    const requestBody = await request.json();
    console.log(
      "[/api/process-template] - Cuerpo de la solicitud:",
      requestBody
    );
    const { placeholders: mainPlaceholders } = requestBody;

    if (!mainPlaceholders || typeof mainPlaceholders !== "object") {
      console.error(
        '[/api/process-template] - Error: Objeto "placeholders" principal inválido o faltante en el cuerpo de la solicitud.'
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
      "[/api/process-template] - Placeholders principales recibidos:",
      mainPlaceholders
    );

    // --- Obtener las cláusulas desde la API ---
    const clauses = await fetchClauses();
    if (!clauses) {
      return NextResponse.json(
        { error: "Error al obtener las cláusulas." },
        { status: 500 }
      );
    }

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
        "[/api/process-template] - Contenido HTML inicial (antes de reemplazar cláusulas):",
        processedHTML.substring(0, 200) + "..."
      );

      // --- Introducir las cláusulas en el HTML ---
      let clausesReplaced = 0;
      for (const clause of clauses) {
        const { placeholder, clauseText } = clause;
        if (mainPlaceholders[placeholder]) {
          const regex = new RegExp(
            placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
            "g"
          );
          const originalLength = processedHTML.length;
          processedHTML = processedHTML.replace(regex, clauseText || "");
          if (processedHTML.length > originalLength) {
            clausesReplaced++;
          }
        }
      }

      console.log(
        "[/api/process-template] - Cláusulas introducidas:",
        clausesReplaced
      );
      console.log(
        "[/api/process-template] - Contenido HTML después de introducir cláusulas:",
        processedHTML.substring(0, 200) + "..."
      );

      // --- Reemplazar los placeholders restantes en el HTML (incluyendo los de las cláusulas) ---
      let mainPlaceholdersReplaced = 0;
      for (const placeholder in mainPlaceholders) {
        const value = mainPlaceholders[placeholder];
        const regex = new RegExp(
          placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
          "g"
        );
        const originalLength = processedHTML.length;
        processedHTML = processedHTML.replace(regex, value || "");
        if (processedHTML.length > originalLength) {
          mainPlaceholdersReplaced++;
        }
      }

      console.log(
        "[/api/process-template] - Placeholders principales reemplazados:",
        mainPlaceholdersReplaced
      );
      console.log(
        "[/api/process-template] - Contenido HTML final procesado:",
        processedHTML.substring(0, 200) + "..."
      );

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
