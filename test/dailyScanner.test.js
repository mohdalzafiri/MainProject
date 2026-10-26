const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { createPdfFromJpegs, MAX_SCAN_PDF_BYTES } = require('../public/daily-scanner');
const { MAX_PDF_SCAN_BYTES, isPdfScanFile } = require('../services/pdfScanUpload');
const { getDailyScanFileName } = require('../utils/dailyScanNaming');
const { getDepartmentMailScanFileName } = require('../utils/departmentMailScanNaming');
const {
  dailyScanRoot,
  getDailyScanSectionDirectory,
  getDailyScanKey
} = require('../services/dailyScanStorage');
const {
  departmentMailScanRoot,
  getDepartmentMailScanDirectory
} = require('../services/departmentMailScanStorage');

const samplePage = {
  dataUrl: 'data:image/jpeg;base64,/9j/2Q==',
  width: 100,
  height: 200
};

test('creates a valid single-page PDF from a scanned JPEG', async () => {
  const pdf = await createPdfFromJpegs([samplePage]);
  const content = Buffer.from(await pdf.arrayBuffer()).toString('latin1');

  assert.equal(pdf.type, 'application/pdf');
  assert.match(content, /^%PDF-1\.4/);
  assert.match(content, /\/Count 1/);
  assert.match(content, /\/Filter \/DCTDecode/);
  assert.match(content, /%%EOF$/);

  const startXref = Number(content.match(/startxref\n(\d+)\n%%EOF$/)[1]);
  assert.equal(content.slice(startXref, startXref + 4), 'xref');
});

test('combines all scanned pages in order into one PDF', async () => {
  const pdf = await createPdfFromJpegs([samplePage, samplePage, samplePage]);
  const content = Buffer.from(await pdf.arrayBuffer()).toString('latin1');

  assert.match(content, /\/Count 3/);
  assert.equal((content.match(/\/Subtype \/Image/g) || []).length, 3);
  assert.equal((content.match(/\/Im0 Do/g) || []).length, 3);
});

test('rejects an empty scan instead of creating a blank PDF', async () => {
  await assert.rejects(createPdfFromJpegs([]), /أضف صفحة واحدة/);
});

test('keeps the client PDF limit below the shared server upload limit', () => {
  assert.equal(MAX_SCAN_PDF_BYTES, 55 * 1024 * 1024);
  assert.equal(MAX_PDF_SCAN_BYTES, 60 * 1024 * 1024);
  assert.ok(MAX_SCAN_PDF_BYTES < MAX_PDF_SCAN_BYTES);
});

test('validates uploaded PDF signatures for both scan routes', () => {
  assert.equal(isPdfScanFile({ buffer: Buffer.from('%PDF-1.4') }), true);
  assert.equal(isPdfScanFile({ buffer: Buffer.from('not-a-pdf') }), false);
  assert.equal(isPdfScanFile(null), false);
});

test('names the PDF from section, date, time, and sequence 001', () => {
  const fileName = getDailyScanFileName(
    { Section: 'أ - البلاغات' },
    new Date(2026, 9, 23, 0, 34, 57),
    1
  );

  assert.equal(fileName, 'أ_-_البلاغات_2026-10-23_00-34-57_001.pdf');
});

test('stores daily PDFs under the PC-SERVER Database Daily section folder', () => {
  assert.equal(dailyScanRoot, '\\\\PC-SERVER\\Database\\Daily');
  assert.equal(
    getDailyScanSectionDirectory('نوبة صبح'),
    '\\\\PC-SERVER\\Database\\Daily\\نوبة_صبح'
  );
});

test('assigns the PDF to the complete daily identity', () => {
  assert.equal(
    getDailyScanKey({
      Today: '2026/10/23',
      Department: 'البلاغات',
      Section: 'أ - البلاغات',
      Period: 'نوبة صبح'
    }),
    '2026-10-23|البلاغات|أ - البلاغات|نوبة صبح'
  );
});

test('creates the section folder when a daily is saved', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-scan-storage-'));
  try {
    const output = execFileSync(process.execPath, ['-e', `
      const storage = require(${JSON.stringify(path.join(__dirname, '..', 'services', 'dailyScanStorage'))});
      process.stdout.write(storage.ensureDailyScanSectionDirectory('نوبة ليل'));
    `], {
      env: { ...process.env, DAILY_SCAN_ROOT: temporaryRoot },
      encoding: 'utf8'
    });

    assert.equal(output, path.join(temporaryRoot, 'نوبة_ليل'));
    assert.equal(fs.existsSync(output), true);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('names department mail PDF from section, date, time, and sequence', () => {
  const fileName = getDepartmentMailScanFileName(
    { Department: 'البلاغات', Section: 'أ - البلاغات' },
    new Date(2026, 9, 26, 17, 42, 9),
    3
  );

  assert.equal(fileName, 'أ_-_البلاغات_2026-10-26_17-42-09_003.pdf');
});

test('stores department mail PDFs under department and section folders', () => {
  assert.equal(departmentMailScanRoot, '\\\\PC-SERVER\\Database\\Mail');
  assert.equal(
    getDepartmentMailScanDirectory({ Department: 'البلاغات', Section: 'أ - البلاغات' }),
    '\\\\PC-SERVER\\Database\\Mail\\البلاغات\\أ_-_البلاغات'
  );
});

test('creates department mail department and section folders when saved', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'department-mail-scan-storage-'));
  try {
    const output = execFileSync(process.execPath, ['-e', `
      const storage = require(${JSON.stringify(path.join(__dirname, '..', 'services', 'departmentMailScanStorage'))});
      process.stdout.write(storage.ensureDepartmentMailScanDirectory({
        Department: 'البلاغات',
        Section: 'نوبة ليل'
      }));
    `], {
      env: { ...process.env, DEPARTMENT_MAIL_SCAN_ROOT: temporaryRoot },
      encoding: 'utf8'
    });

    assert.equal(output, path.join(temporaryRoot, 'البلاغات', 'نوبة_ليل'));
    assert.equal(fs.existsSync(output), true);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
