import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import supertest from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../app.js';
import { prisma, disconnect } from '../lib/prisma.js';
import { hashPassword } from '../lib/auth.js';

// Approving a row calls `reembedPart`, which hits the real Gemini API — this
// suite, like every other in this repo, never makes a real network call
// (see `embeddings.test.ts`). Stubbed here rather than passed through.
vi.mock('../services/ingestion/reembed-part.js', () => ({
  reembedPart: vi.fn().mockResolvedValue(undefined),
}));

// Real dev database, same convention as every other route test in this repo.
const app = createApp();
const request = supertest(app);

const STAFF_USERNAME = 'ingestion-test-staff';
const TEST_PASSWORD = 'correct horse battery staple';

let staffToken: string;

async function buildXlsxBuffer(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

beforeAll(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  await prisma.user.upsert({
    where: { username: STAFF_USERNAME },
    create: { name: 'Ingestion Test Staff', username: STAFF_USERNAME, passwordHash, role: 'STAFF' },
    update: { passwordHash, role: 'STAFF', isActive: true },
  });
  const login = await request.post('/auth/login').send({ username: STAFF_USERNAME, password: TEST_PASSWORD });
  staffToken = login.body.token;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: STAFF_USERNAME } });
  await disconnect();
});

describe('POST /ingestion/preview', () => {
  it('401s with no auth token', async () => {
    const res = await request.post('/ingestion/preview');
    expect(res.status).toBe(401);
  });

  it('parses an uploaded file and returns headers + rows, persisting nothing', async () => {
    const buffer = await buildXlsxBuffer(
      ['Category', 'Brand', 'Part No', 'Description'],
      [['U-Joints', 'GMB', 'ZZ999', 'Test part for ingestion preview']],
    );
    const runsBefore = await prisma.ingestionRun.count();

    const res = await request
      .post('/ingestion/preview')
      .set('Authorization', `Bearer ${staffToken}`)
      .attach('file', buffer, 'price-list.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.headers).toEqual(['Category', 'Brand', 'Part No', 'Description']);
    expect(res.body.rows).toHaveLength(1);
    expect(await prisma.ingestionRun.count()).toBe(runsBefore);
  });
});

describe('POST /ingestion/import + review + approve', () => {
  const testMapping = {
    category: 'Category',
    brand: 'Brand',
    partNumber: 'Part No',
    rawName: 'Description',
    recordNumber: 'Record',
  };

  it('flags a row with an unmatched category/brand and leaves a clean row unflagged', async () => {
    const uJoints = await prisma.category.findFirstOrThrow({ where: { slug: 'u-joints' } });
    const gmb = await prisma.brand.findFirstOrThrow({ where: { name: 'GMB' } });

    const res = await request
      .post('/ingestion/import')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        sourceFile: 'test-price-list.xlsx',
        folderLabel: '4 — Electrical Parts',
        mapping: testMapping,
        rows: [
          { Category: 'U-Joints', Brand: 'GMB', 'Part No': 'ZZ-CLEAN-1', Description: 'Clean test part', Record: '17' },
          { Category: 'Nonexistent Category', Brand: 'GMB', 'Part No': 'ZZ-BAD-1', Description: 'Bad category part', Record: '18' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.rowsTotal).toBe(2);
    expect(res.body.rowsFlagged).toBe(1);

    const rows = await request
      .get(`/ingestion/runs/${res.body.runId}/rows`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(rows.body.rows).toHaveLength(2);
    const clean = rows.body.rows.find((r: { rawName: string }) => r.rawName === 'Clean test part');
    const bad = rows.body.rows.find((r: { rawName: string }) => r.rawName === 'Bad category part');
    expect(clean.error).toBeNull();
    expect(clean.parsedAttributes.categoryId).toBe(uJoints.id);
    expect(clean.parsedAttributes.brandId).toBe(gmb.id);
    expect(bad.error).toContain('no matching category');

    // Approving the clean row creates a real Part with the run's folderLabel
    // and the row's own recordNumber.
    const approve = await request
      .post(`/ingestion/rows/${clean.id}/approve`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(approve.status).toBe(200);
    expect(approve.body.ok).toBe(true);

    const part = await prisma.part.findUniqueOrThrow({ where: { id: approve.body.partId } });
    expect(part.folderLabel).toBe('4 — Electrical Parts');
    expect(part.recordNumber).toBe('17');
    expect(part.partNumber).toBe('ZZ-CLEAN-1');

    // The flagged row cannot be approved until its error is resolved.
    const rejectedApprove = await request
      .post(`/ingestion/rows/${bad.id}/approve`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(rejectedApprove.status).toBe(400);

    // PATCH-ing a new category resolves it, then approve succeeds.
    const patched = await request
      .patch(`/ingestion/rows/${bad.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ newCategoryName: 'Test Category For Ingestion' });
    expect(patched.status).toBe(200);
    expect(patched.body.error).toBeNull();

    const secondApprove = await request
      .post(`/ingestion/rows/${bad.id}/approve`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(secondApprove.status).toBe(200);
    expect(secondApprove.body.ok).toBe(true);

    // Cleanup: the parts + the created category are real rows in the dev DB.
    await prisma.part.deleteMany({ where: { partNumber: { in: ['ZZ-CLEAN-1', 'ZZ-BAD-1'] } } });
    await prisma.category.deleteMany({ where: { slug: 'test-category-for-ingestion' } });
  });

  it('reject skips a row with no Part created', async () => {
    const importRes = await request
      .post('/ingestion/import')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        sourceFile: 'test-price-list-2.xlsx',
        mapping: testMapping,
        rows: [{ Category: 'U-Joints', Brand: 'GMB', 'Part No': 'ZZ-REJECT-1', Description: 'Reject me' }],
      });

    const rows = await request
      .get(`/ingestion/runs/${importRes.body.runId}/rows`)
      .set('Authorization', `Bearer ${staffToken}`);
    const row = rows.body.rows[0];

    const reject = await request
      .post(`/ingestion/rows/${row.id}/reject`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reason: 'duplicate of an existing listing' });
    expect(reject.status).toBe(200);
    expect(reject.body.partId).toBeNull();
    expect(reject.body.error).toBe('duplicate of an existing listing');

    const part = await prisma.part.findFirst({ where: { partNumber: 'ZZ-REJECT-1' } });
    expect(part).toBeNull();
  });

  it('approve-clean bulk-approves every unflagged pending row and leaves flagged rows untouched', async () => {
    const importRes = await request
      .post('/ingestion/import')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        sourceFile: 'test-price-list-3.xlsx',
        mapping: testMapping,
        rows: [
          { Category: 'U-Joints', Brand: 'GMB', 'Part No': 'ZZ-BULK-1', Description: 'Bulk clean part' },
          { Category: 'Not A Real Category', Brand: 'GMB', 'Part No': 'ZZ-BULK-2', Description: 'Bulk flagged part' },
        ],
      });

    const approveClean = await request
      .post(`/ingestion/runs/${importRes.body.runId}/approve-clean`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(approveClean.status).toBe(200);
    expect(approveClean.body.attempted).toBe(1);
    expect(approveClean.body.approved).toBe(1);

    const created = await prisma.part.findFirst({ where: { partNumber: 'ZZ-BULK-1' } });
    expect(created).not.toBeNull();
    const notCreated = await prisma.part.findFirst({ where: { partNumber: 'ZZ-BULK-2' } });
    expect(notCreated).toBeNull();

    await prisma.part.deleteMany({ where: { partNumber: 'ZZ-BULK-1' } });
  });
});
