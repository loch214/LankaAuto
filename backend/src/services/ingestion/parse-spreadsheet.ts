/**
 * Turns an uploaded price-list file (`.xlsx` or `.csv`) into plain rows of
 * `{ header: cellText }`, so `/ingestion/preview` can show staff the columns
 * to map and `/ingestion/import` can read from whatever mapping they picked.
 *
 * Pure with respect to I/O beyond the buffer it's given — no DB, no network
 * — so it's unit-testable with a small in-memory workbook fixture.
 */
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';

export interface ParsedSpreadsheet {
  readonly headers: string[];
  readonly rows: Record<string, string>[];
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    // Rich text / formula-result cells: ExcelJS represents these as objects
    // (`{ richText: [...] }`, `{ result: ... }`, `{ text: ... }`) rather than
    // a plain scalar. Cheapest correct thing is to take whichever of these
    // sub-shapes is present rather than stringify the object itself.
    const obj = value as unknown as Record<string, unknown>;
    if ('text' in obj && typeof obj['text'] === 'string') return obj['text'];
    if ('result' in obj) return cellText(obj['result'] as ExcelJS.CellValue);
    if ('richText' in obj && Array.isArray(obj['richText'])) {
      return (obj['richText'] as { text: string }[]).map((r) => r.text).join('');
    }
    return '';
  }
  return String(value).trim();
}

/**
 * Reads the first worksheet only — every price list this project has seen
 * so far is a single-sheet file, and asking staff to also pick a sheet would
 * be one more decision for no real benefit yet.
 */
export async function parseSpreadsheet(buffer: Buffer, filename: string): Promise<ParsedSpreadsheet> {
  const workbook = new ExcelJS.Workbook();

  const isCsv = filename.toLowerCase().endsWith('.csv');
  if (isCsv) {
    // `Readable.from(buffer)` iterates a Buffer element-by-element (each
    // byte as its own "chunk", since Buffer is itself Iterable<number>) —
    // fast-csv then sees a stream of numbers instead of binary chunks and
    // throws. Wrapping it in a one-element array makes the whole buffer a
    // single chunk, which is what a readable byte stream actually means.
    await workbook.csv.read(Readable.from([buffer]));
  } else {
    // exceljs's own `.d.ts` declares its `load()` parameter against a
    // `Buffer` from a different (bundled) `@types/node` than this project's,
    // so the two nominal types don't match structurally even though they're
    // the same runtime `Buffer` — a known exceljs typing issue, not a real
    // type mismatch.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  }

  const sheet = workbook.worksheets[0];
  if (sheet === undefined) {
    throw new Error('the file has no worksheet');
  }

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cellText(cell.value);
    headers[colNumber - 1] = text.length > 0 ? text : `Column ${colNumber}`;
  });

  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, index) => {
      const text = cellText(row.getCell(index + 1).value);
      if (text.length > 0) hasValue = true;
      record[header] = text;
    });
    if (hasValue) rows.push(record);
  });

  return { headers: headers.filter((h) => h !== undefined), rows };
}
