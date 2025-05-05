import { NextResponse } from "next/server";
import * as fs from "fs/promises";
import path from "path";
import mammoth from "mammoth";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "app",
  "Templates",
  "1.00 - Contrato de Locación de Vivienda - Template.docx"
);
const CLAUSES_API_URL =
  "https://inmoacuerdos-vercel-server.vercel.app/api/1.00-locacion-get-clauses";

async function fetchClauses() {
  // ... (tu función fetchClauses actual)
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
        '[/api/process-template] - Error: Objeto "placeholders" principal inválido o faltante.'
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

    const clauses = await fetchClauses();
    if (!clauses || clauses.length === 0) {
      return NextResponse.json(
        {
          error: "No se pudieron obtener las cláusulas o la lista está vacía.",
        },
        { status: 500 }
      );
    }

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
      );

      // --- Introducir las cláusulas en el HTML ---
      let clausesReplaced = 0;
      for (const clause of clauses) {
        if (mainPlaceholders[clause.placeholder]) {
          const regex = new RegExp(
            clause.placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
            "g"
          );
          const originalLength = processedHTML.length;
          processedHTML = processedHTML.replace(regex, clause.clauseText || "");
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

      // --- Reemplazo iterativo de todos los placeholders ---
      let placeholdersReplaced = 0;
      let previousHTML = "";
      while (processedHTML !== previousHTML) {
        previousHTML = processedHTML;
        for (const placeholder in mainPlaceholders) {
          const value = mainPlaceholders[placeholder];
          const regex = new RegExp(
            placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"),
            "g"
          );
          const originalLength = processedHTML.length;
          processedHTML = processedHTML.replace(regex, value || "");
          if (processedHTML.length > originalLength) {
            placeholdersReplaced++;
          }
        }
      }
      console.log(
        "[/api/process-template] - Placeholders reemplazados (iterativo):",
        placeholdersReplaced
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
