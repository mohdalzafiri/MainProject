const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const mammoth = require('mammoth');

function resolveTemplatesRoot() {
  const configuredPath = String(process.env.TEMPLATES_ROOT || '').trim();
  if (configuredPath) {
    return path.normalize(configuredPath);
  }

  const mappedPath = 'Z:\\AdministrativeTemplates';
  if (fs.existsSync(mappedPath)) {
    return path.normalize(mappedPath);
  }

  return path.normalize('\\\\PC-SERVER\\Database\\AdministrativeTemplates');
}

const templatesRoot = resolveTemplatesRoot();
const outputRoot = path.resolve(__dirname, '..', 'public', 'generated', 'administrative');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const normalized = raw.replace(/-/g, '/');
  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    return `${match[1]}/${pad2(match[2])}/${pad2(match[3])}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
}

function formatTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const match = raw.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) return '';
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = Number(match[3] || 0);

  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return '';
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}

function formatTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  const datePart = `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
  return `${time} ${datePart}`;
}

function ensureDirectories() {
  fs.mkdirSync(templatesRoot, { recursive: true });
  fs.mkdirSync(outputRoot, { recursive: true });
}

function getTemplatePath(templateName) {
  const safeName = path.basename(String(templateName || '').trim());
  if (!safeName) {
    throw new Error('اسم القالب مطلوب.');
  }

  if (!safeName.toLowerCase().endsWith('.docx')) {
    throw new Error('القالب يجب أن يكون بصيغة DOCX.');
  }

  const fullPath = path.resolve(templatesRoot, safeName);
  if (!fullPath.startsWith(templatesRoot)) {
    throw new Error('اسم القالب غير صالح.');
  }

  if (!fs.existsSync(fullPath)) {
    throw new Error('ملف القالب غير موجود.');
  }

  return fullPath;
}

function listTemplates() {
  ensureDirectories();

  return fs.readdirSync(templatesRoot)
    .filter((fileName) => fileName.toLowerCase().endsWith('.docx'))
    .sort((a, b) => a.localeCompare(b, 'ar'));
}

function readTemplateTags(templatePath) {
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true
  });

  return doc.getFullText();
}

function createOutputPaths(prefix = 'leave-permit') {
  const now = new Date();
  const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const random = Math.random().toString(36).slice(2, 8);
  const base = `${prefix}-${stamp}-${random}`;

  return {
    base,
    docxPath: path.join(outputRoot, `${base}.docx`),
    pdfPath: path.join(outputRoot, `${base}.pdf`),
    docxUrl: `/generated/administrative/${base}.docx`,
    pdfUrl: `/generated/administrative/${base}.pdf`
  };
}

function convertDocxToPdf(docxPath, pdfPath) {
  const defaultConverter = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
  const converter = process.env.LIBREOFFICE_PATH && process.env.LIBREOFFICE_PATH.trim()
    ? process.env.LIBREOFFICE_PATH.trim()
    : (fs.existsSync(defaultConverter) ? defaultConverter : 'soffice');

  const outDir = path.dirname(pdfPath);

  const result = spawnSync(converter, [
    '--headless',
    '--convert-to',
    'pdf',
    '--outdir',
    outDir,
    docxPath
  ], {
    encoding: 'utf8',
    windowsHide: true
  });

  if (result.error) {
    return {
      converted: false,
      reason: result.error.message || 'تعذر تشغيل محول PDF.'
    };
  }

  if (result.status !== 0) {
    return {
      converted: false,
      reason: (result.stderr || result.stdout || 'فشل تحويل الملف إلى PDF.').trim()
    };
  }

  const expectedPdfPath = path.join(outDir, `${path.basename(docxPath, '.docx')}.pdf`);
  if (!fs.existsSync(expectedPdfPath)) {
    return {
      converted: false,
      reason: 'تم تشغيل المحول لكن ملف PDF لم يتم إنشاؤه.'
    };
  }

  if (expectedPdfPath !== pdfPath) {
    fs.copyFileSync(expectedPdfPath, pdfPath);
  }

  return { converted: true, reason: '' };
}

function renderDocxFromTemplate(templatePath, payload, outputPath) {
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true
  });

  doc.render(payload || {});
  const buffer = doc.getZip().generate({ type: 'nodebuffer' });
  fs.writeFileSync(outputPath, buffer);
}

function replaceNthCell(rowXml, cellIndex, newCellXml) {
  const cellMatches = [...rowXml.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)];
  if (cellMatches.length < cellIndex) return rowXml;
  const match = cellMatches[cellIndex - 1];
  return rowXml.slice(0, match.index) + newCellXml + rowXml.slice(match.index + match[0].length);
}

function ensureParagraphCentered(cellXml) {
  return cellXml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    if (/<w:pPr[\s\S]*?<\/w:pPr>/.test(paragraphXml)) {
      return paragraphXml.replace(/<w:pPr([\s\S]*?)>([\s\S]*?)<\/w:pPr>/, (_all, attrs, inner) => {
        const withoutJc = inner.replace(/<w:jc\b[^>]*\/>/g, '');
        return `<w:pPr${attrs}>${withoutJc}<w:jc w:val="center"/></w:pPr>`;
      });
    }

    return paragraphXml.replace(/<w:p\b([^>]*)>/, '<w:p$1><w:pPr><w:jc w:val="center"/></w:pPr>');
  });
}

function applyRunStyle(cellXml, runStyleXml) {
  if (!runStyleXml) return cellXml;

  return cellXml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (runXml) => {
    if (!/<w:t\b/.test(runXml)) {
      return runXml;
    }

    if (/<w:rPr[\s\S]*?<\/w:rPr>/.test(runXml)) {
      return runXml.replace(/<w:rPr[\s\S]*?<\/w:rPr>/, runStyleXml);
    }

    return runXml.replace(/<w:r\b([^>]*)>/, `<w:r$1>${runStyleXml}`);
  });
}

function applyPreparationTemplateFormatting(docxPath) {
  if (!docxPath || !fs.existsSync(docxPath)) return;

  const zip = new PizZip(fs.readFileSync(docxPath));
  const file = zip.file('word/document.xml');
  if (!file) return;

  let xml = file.asText();
  const rowMatches = [...xml.matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)];
  if (rowMatches.length < 9) return;

  const headerRow = rowMatches[2][0];
  const headerCells = [...headerRow.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)];
  const headerNameCell = headerCells[1] ? headerCells[1][0] : '';
  const headerRunStyle = (headerNameCell.match(/<w:rPr[\s\S]*?<\/w:rPr>/) || [])[0] || '';

  const targetRows = [0, 1, 3, 4, 5, 6, 7, 8];
  const updates = [];

  targetRows.forEach((rowIndex) => {
    const rowMatch = rowMatches[rowIndex];
    if (!rowMatch) return;
    const rowXml = rowMatch[0];
    const rowCells = [...rowXml.matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)];
    if (rowCells.length < 2) return;

    const nameCellXml = rowCells[1][0];
    let transformedCell = ensureParagraphCentered(nameCellXml);
    transformedCell = applyRunStyle(transformedCell, headerRunStyle);
    let transformedRow = replaceNthCell(rowXml, 2, transformedCell);

    if (rowIndex >= 3 && rowIndex <= 8) {
      const expectedNumber = String(rowIndex - 2);
      const numberCellIndex = rowCells.findIndex((cellMatch) => {
        const plainText = String(cellMatch[0] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        return plainText === expectedNumber;
      });

      if (numberCellIndex >= 0) {
        const numberCellXml = rowCells[numberCellIndex][0];
        const styledNumberCell = applyRunStyle(numberCellXml, headerRunStyle);
        transformedRow = replaceNthCell(transformedRow, numberCellIndex + 1, styledNumberCell);
      }
    }

    updates.push({
      start: rowMatch.index,
      end: rowMatch.index + rowXml.length,
      row: transformedRow
    });
  });

  if (!updates.length) return;

  let rebuilt = '';
  let cursor = 0;
  updates.sort((a, b) => a.start - b.start).forEach((item) => {
    rebuilt += xml.slice(cursor, item.start) + item.row;
    cursor = item.end;
  });
  rebuilt += xml.slice(cursor);

  zip.file('word/document.xml', rebuilt);
  fs.writeFileSync(docxPath, zip.generate({ type: 'nodebuffer' }));
}

async function renderDocxTemplateToHtml(templatePath, payload) {
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true
  });

  doc.render(payload || {});
  const buffer = doc.getZip().generate({ type: 'nodebuffer' });
  const result = await mammoth.convertToHtml({ buffer }, {
    includeDefaultStyleMap: true,
    convertImage: mammoth.images.imgElement(function(image) {
      return image.read('base64').then(function(imageBuffer) {
        return {
          src: `data:${image.contentType};base64,${imageBuffer}`
        };
      });
    })
  });

  return {
    html: result.value || '',
    messages: result.messages || []
  };
}

module.exports = {
  templatesRoot,
  outputRoot,
  formatDate,
  formatTime,
  formatTimestamp,
  listTemplates,
  getTemplatePath,
  readTemplateTags,
  createOutputPaths,
  renderDocxFromTemplate,
  applyPreparationTemplateFormatting,
  renderDocxTemplateToHtml,
  convertDocxToPdf,
  ensureDirectories
};
