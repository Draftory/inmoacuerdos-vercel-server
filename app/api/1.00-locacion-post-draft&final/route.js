import { google } from "googleapis";
import cors from 'cors';

const allowedOrigins = [
  'https://www.inmoacuerdos.com',
  'https://inmoacuerdos.webflow.io'
];

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      // Allow the request if the origin is in the allowed list or if no origin is provided
      callback(null, true);
    } else {
      // Reject the request if the origin is not allowed
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'], // Ensure OPTIONS method is allowed
  allowedHeaders: ['Content-Type', 'Authorization'], // Allow necessary headers
};

export default async function handler(req, res) {
  // Apply CORS middleware before handling the request
  cors(corsOptions)(req, res, async () => {
    // Handle preflight (OPTIONS) requests separately
    if (req.method === "OPTIONS") {
      return res.status(200).send(''); // Respond with status 200 for OPTIONS requests
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

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
      const spreadsheetId = process.env.LOCACION_POST_DATABASE_SHEET_ID; // Use the environment variable for Google Sheets ID
      const sheetName = process.env.LOCACION_POST_DATABASE_SHEET_NAME; // Use the environment variable for sheet name

      // Extract form data from request body
      const { formData } = req.body;
      const contractID = formData.contractID;

      if (!contractID) {
        return res.status(400).json({ error: "Missing contractID" });
      }

      // Fetch all rows to check if contractID exists
      const readResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:Z`, // Fetch all columns in the range
      });

      const rows = readResponse.data.values || [];

      // Get the header row to dynamically find the index of the contractID column
      const headers = rows[0] || [];
      const contractIDColumnIndex = headers.indexOf("contractID"); // Replace with the actual header name if different

      if (contractIDColumnIndex === -1) {
        return res.status(400).json({ error: "contractID column not found" });
      }

      // Check if contractID already exists in any row
      const existingRowIndex = rows.findIndex(row => row[contractIDColumnIndex] === contractID);

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
        const updateRange = `${sheetName}!A${existingRowIndex + 1}:Z${existingRowIndex + 1}`; // Update the row corresponding to contractID

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
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
}
