import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseSpreadsheet } from './parse-spreadsheet.js';

async function buildXlsxBuffer(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('parseSpreadsheet', () => {
  it('reads headers and rows from an .xlsx buffer', async () => {
    const buffer = await buildXlsxBuffer(
      ['Category', 'Brand', 'Part No', 'Description'],
      [
        ['Electrical', 'Bosch', 'B100', 'Starter motor'],
        ['Electrical', 'Bosch', 'B101', 'Alternator'],
      ],
    );

    const result = await parseSpreadsheet(buffer, 'test.xlsx');
    expect(result.headers).toEqual(['Category', 'Brand', 'Part No', 'Description']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      Category: 'Electrical',
      Brand: 'Bosch',
      'Part No': 'B100',
      Description: 'Starter motor',
    });
  });

  it('skips fully blank rows', async () => {
    const buffer = await buildXlsxBuffer(
      ['Category', 'Description'],
      [
        ['Electrical', 'Starter motor'],
        ['', ''],
      ],
    );
    const result = await parseSpreadsheet(buffer, 'test.xlsx');
    expect(result.rows).toHaveLength(1);
  });

  it('reads a .csv buffer the same way as .xlsx', async () => {
    const csv = 'Category,Description\r\nElectrical,Starter motor\r\n';
    const result = await parseSpreadsheet(Buffer.from(csv), 'test.csv');
    expect(result.headers).toEqual(['Category', 'Description']);
    expect(result.rows).toEqual([{ Category: 'Electrical', Description: 'Starter motor' }]);
  });
});
