import ExcelJS from "exceljs";

export type RawRow = { rowNumber: number; values: Record<string, unknown> };

/** Reads every sheet into header-keyed rows. Empty rows are skipped; empty cells become null. */
export async function readWorkbook(file: string): Promise<Map<string, RawRow[]>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);

  const sheets = new Map<string, RawRow[]>();
  workbook.eachSheet((sheet) => {
    const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((h) => String(h ?? "").trim());
    const rows: RawRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells = (row.values as unknown[]).slice(1);
      if (cells.every((c) => c === null || c === undefined || c === "")) return;
      const values: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        if (h) values[h] = cells[i] === undefined || cells[i] === "" ? null : cells[i];
      });
      rows.push({ rowNumber, values });
    });
    sheets.set(sheet.name, rows);
  });
  return sheets;
}
