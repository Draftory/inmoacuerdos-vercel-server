const fs = require("fs");
const path = require("path");
const htmlDocx = require("html-docx-js");
const { Blob } = require("buffer"); // Asegúrate de tener esto

const html = `
    <h1>Contrato de Alquiler</h1>
    <p>Este es un contrato entre <strong>{{nombreLocador}}</strong> y <strong>{{nombreLocatario}}</strong>.</p>
    <p>Fecha de firma: {{fecha}}</p>
`;

// Generar el Blob
const blob = htmlDocx.asBlob(html);

// Convertir el Blob a Buffer
blob.arrayBuffer().then((arrayBuffer) => {
  const buffer = Buffer.from(arrayBuffer);
  const outputPath = path.join(__dirname, "contrato-generado.docx");
  fs.writeFileSync(outputPath, buffer);
  console.log("Documento generado:", outputPath);
});
