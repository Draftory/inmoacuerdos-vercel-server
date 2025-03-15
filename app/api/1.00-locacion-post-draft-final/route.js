import Cors from "cors";
import { google } from "googleapis";

const allowedOrigins = [
  "https://www.inmoacuerdos.com",
  "https://inmoacuerdos.webflow.io",
];

const cors = Cors({
  methods: ["POST", "OPTIONS"],
  origin: allowedOrigins,
  allowedHeaders: ["Content-Type"],
});

export default async function handler(req, res) {
  await new Promise((resolve, reject) => {
    cors(req, res, (result) => {
      if (result instanceof Error) {
        console.error("CORS Error:", result);
        return reject(result);
      }
      console.log("CORS Headers set:", res.getHeaders());
      resolve();
    });
  });

  if (req.method === "OPTIONS") {
    // Explicitly set CORS headers
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  // Your Google Sheets Logic (Keep this)
  if (req.method === "POST") {
    try {
      // Decode Google Service Account Credentials
      const credentials = JSON.parse(
        Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS, "base64").toString()
      );

      // Authenticate with Google Sheets API
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const sheets = google.sheets({ version: "v4", auth });

      // Spreadsheet Details
      const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID;
      const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME;

      // Extract form data from request body
      const { formData } = req.body;
      const contractID = formData.contractID;

      if (!contractID) {
        return res.status(400).json({ error: "Missing contractID" });
      }

      // Fetch all rows to check if contractID exists
      const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
      });

      const rows = readResponse.data.values || [];

      // Get the header row to dynamically find the index of the contractID column
      const headers = rows[0] || [];
      const contractIDColumnIndex = headers.indexOf("contractID");

      if (contractIDColumnIndex === -1) {
        return res.status(400).json({ error: "contractID column not found" });
      }

      // Check if contractID already exists in any row
      const existingRowIndex = rows.findIndex(
        (row) => row[contractIDColumnIndex] === contractID
      );

      if (existingRowIndex === -1) {
        // Contract ID doesn't exist, create a new row
        const newRow = Object.values(formData);
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `${sheetName}!A:Z`,
          valueInputOption: "RAW",
          requestBody: {
            values: [newRow],
          },
        });

        return res.status(200).json({ message: "New row added successfully." });
      } else {
        // Contract ID exists, update the existing row
        const updatedRow = Object.values(formData);
        const updateRange = `${sheetName}!A${
          existingRowIndex + 1
        }:Z${existingRowIndex + 1}`;

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: updateRange,
          valueInputOption: "RAW",
          requestBody: {
            values: [updatedRow],
          },
        });

        return res.status(200).json({ message: "Row updated successfully." });
      }
    } catch (error) {
      console.error("Error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
}