// utils/googleSheetsUtils.js
import { google } from "googleapis";

export async function getGoogleSheetsClient(credentialsBase64) {
  try {
    const googleCredentialsJson = Buffer.from(
      credentialsBase64,
      "base64"
    ).toString("utf-8");
    const credentials = JSON.parse(googleCredentialsJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: "https://www.googleapis.com/auth/spreadsheets",
    });
    const client = await auth.getClient();
    return google.sheets({ version: "v4", auth: client });
  } catch (error) {
    console.error("Error initializing Google Sheets client:", error);
    throw new Error("Failed to initialize Google Sheets client.");
  }
}

export async function getSheetHeaderRow(sheets, spreadsheetId, sheetName) {
  try {
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
    });
    return headerResponse.data?.values?.[0] || [];
  } catch (error) {
    console.error("Error getting header row:", error);
    throw new Error("Failed to get header row from Google Sheet.");
  }
}

export async function updateSheetRow(
  sheets,
  spreadsheetId,
  sheetName,
  range,
  values
) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: range,
      valueInputOption: "RAW",
      requestBody: { values: [values] },
    });
  } catch (error) {
    console.error(`Error updating row at range ${range}:`, error);
    throw new Error(`Failed to update row in Google Sheet at range ${range}.`);
  }
}

export async function findRowByColumns(
  sheets,
  spreadsheetId,
  sheetName,
  searchColumns,
  searchValues
) {
  try {
    const allRowsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A:ZZ`,
    }); // Adjust range as needed
    const allRows = allRowsResponse.data?.values || [];
    const headerRow = await getSheetHeaderRow(sheets, spreadsheetId, sheetName);
    const columnIndices = searchColumns.map((col) => headerRow.indexOf(col));

    if (columnIndices.some((index) => index === -1)) {
      console.warn("Una o más columnas de búsqueda no encontradas.");
      return { rowIndex: -1, rowData: null };
    }

    for (let i = 1; i < allRows.length; i++) {
      const matches = searchColumns.every(
        (_, index) => allRows[i][columnIndices[index]] === searchValues[index]
      );
      if (matches) {
        return { rowIndex: i + 1, rowData: allRows[i] };
      }
    }

    return { rowIndex: -1, rowData: null };
  } catch (error) {
    console.error("Error finding row by columns:", error);
    throw new Error(
      "Failed to find row in Google Sheet by the specified criteria."
    );
  }
}
