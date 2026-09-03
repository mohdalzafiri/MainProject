const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const mammoth = require('mammoth');
const ExcelJS = require('exceljs');
const { db, logSystem, getCurrentTimestamp } = require('../database');
const {
  LEGACY_CATEGORY_ALIASES,
  ensureArchiveCategoriesTable,
  normalizeCategoryKey,
  listArchiveCategories,
  getArchiveCategory,
  getArchiveCategoryPath
} = require('../services/archiveCategoryService');

const router = express.Router();

function getArchiveRoot() {
  const uncRoot = '\\\\PC-SERVER\\Database\\Archive';
  const localRoot = path.join(__dirname, '..', 'Archive');

  if (fs.existsSync('\\\\PC-SERVER\\Database')) {
    try {
      fs.mkdirSync(uncRoot, { recursive: true });
      return uncRoot;
    } catch (error) {
      console.warn('Unable to use UNC archive root, falling back to local path.', error.message);
    }
  }

  fs.mkdirSync(localRoot, { recursive: true });
  return localRoot;
}

const archiveRoot = getArchiveRoot();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

function normalize(value) {
  return String(value || '').trim();
}

function normalizeCategory(value) {
  return normalizeCategoryKey(value);
}

function fileTypeFromExtension(extension) {
  const ext = (extension || '').toLowerCase().replace(/^\./, '');
  if (!ext) return 'file';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) return 'image';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'document';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
  return 'file';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function previewDocument(title, body) {
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>*{box-sizing:border-box}body{margin:0;padding:18px;background:#fff;color:#111827;font-family:Tahoma,Arial,sans-serif}img{max-width:100%;height:auto;display:block;margin:auto}table{width:100%;border-collapse:collapse;font-size:12px;direction:ltr}th,td{border:1px solid #cbd5e1;padding:5px 7px;min-width:64px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}tr:first-child td{background:#e2e8f0;font-weight:700}.document-preview{direction:rtl;line-height:1.65}.document-preview table{direction:rtl}@media print{body{padding:0}}</style></head><body>${body}</body></html>`;
}

function countPagesForFile(fileBuffer, extension) {
  const ext = (extension || '').toLowerCase().replace(/^\./, '');
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
    return 1;
  }

  if (ext === 'pdf') {
    const bufferText = fileBuffer.toString('latin1');
    const typePageMatches = [...bufferText.matchAll(/\/Type\s*\/Page\b/gi)];
    if (typePageMatches.length) {
      return typePageMatches.length;
    }

    const pattern = /\/Count\s+(\d+)/gi;
    const matches = [...bufferText.matchAll(pattern)];
    if (matches.length) {
      const total = matches.reduce((sum, match) => sum + Math.max(0, Number(match[1]) || 0), 0);
      if (total > 0) return total;
    }

    return 1;
  }

  return 1;
}

function ensureArchiveTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS Archive (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      FileName TEXT NOT NULL,
      FileType TEXT NOT NULL,
      PageCount INTEGER NOT NULL DEFAULT 0,
      UploadedAt TEXT NOT NULL,
      Category TEXT NOT NULL,
      Extension TEXT NOT NULL,
      StoragePath TEXT NOT NULL,
      OriginalName TEXT NOT NULL
    )
  `).run();
}

ensureArchiveTable();
ensureArchiveCategoriesTable(db, getCurrentTimestamp);

function mergeArchiveDirectory(sourceDirectory, targetDirectory) {
  if (!fs.existsSync(sourceDirectory)) return;
  fs.mkdirSync(targetDirectory, { recursive: true });

  fs.readdirSync(sourceDirectory).forEach((name) => {
    const sourcePath = path.join(sourceDirectory, name);
    const targetPath = path.join(targetDirectory, name);
    if (!fs.existsSync(targetPath)) {
      fs.renameSync(sourcePath, targetPath);
      return;
    }

    if (fs.statSync(sourcePath).isDirectory() && fs.statSync(targetPath).isDirectory()) {
      mergeArchiveDirectory(sourcePath, targetPath);
    }
  });

  if (fs.readdirSync(sourceDirectory).length === 0) {
    fs.rmSync(sourceDirectory, { recursive: true, force: true });
  }
}

function migrateLegacyArchiveCategories() {
  Object.entries(LEGACY_CATEGORY_ALIASES).forEach(([legacyKey, categoryKey]) => {
    mergeArchiveDirectory(path.join(archiveRoot, legacyKey), path.join(archiveRoot, categoryKey));
    db.prepare(`
      UPDATE Archive
      SET Category = ?, StoragePath = REPLACE(StoragePath, ?, ?)
      WHERE Category = ?
    `).run(categoryKey, `${legacyKey}${path.sep}`, `${categoryKey}${path.sep}`, legacyKey);
  });

  listArchiveCategories(db).forEach((category) => {
    fs.mkdirSync(path.join(archiveRoot, ...getArchiveCategoryPath(db, category.KeyName)), { recursive: true });
  });
}

migrateLegacyArchiveCategories();

function getCategoryDirectory(category) {
  const categoryPath = getArchiveCategoryPath(db, category);
  return path.join(archiveRoot, ...categoryPath);
}

function buildFileUrl(category, id, fileName) {
  const categoryPath = getArchiveCategoryPath(db, category).map(encodeURIComponent).join('/');
  return `/archive-files/${categoryPath}/${encodeURIComponent(String(id))}/${encodeURIComponent(fileName)}`;
}

function listFilesForRecord(category, recordId) {
  const recordDirectory = path.join(getCategoryDirectory(category), String(recordId));
  if (!fs.existsSync(recordDirectory)) {
    return [];
  }

  return fs.readdirSync(recordDirectory)
    .filter((item) => !fs.statSync(path.join(recordDirectory, item)).isDirectory())
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function getPrimaryFileForRecord(category, recordId) {
  const files = listFilesForRecord(category, recordId);
  return files[0] || '';
}

function serializeRow(row) {
  const category = String(row.Category || 'circulars');
  const normalizedCategory = normalizeCategory(category);
  const categoryRecord = getArchiveCategory(db, normalizedCategory, { includeInactive: true });
  const fileName = String(row.FileName || '').trim() || String(row.OriginalName || '').trim();
  const primaryFile = getPrimaryFileForRecord(normalizedCategory, row.ID);
  const primaryExtension = path.extname(primaryFile).replace(/^\./, '').toLowerCase();
  const url = `/api/archive/download/${encodeURIComponent(normalizedCategory)}/${encodeURIComponent(String(row.ID))}`;
  const previewUrl = `/api/archive/preview/${encodeURIComponent(normalizedCategory)}/${encodeURIComponent(String(row.ID))}`;

  return {
    ID: Number(row.ID),
    FileName: fileName,
    FileType: String(row.FileType || 'file'),
    PageCount: Number(row.PageCount || 0),
    UploadedAt: row.UploadedAt,
    Category: normalizedCategory,
    CategoryLabel: categoryRecord?.LabelAr || normalizedCategory,
    Extension: String(row.Extension || '').replace(/^\./, '').toLowerCase(),
    DownloadUrl: url,
    PreviewUrl: previewUrl,
    ThumbnailUrl: primaryFile && ['image', 'pdf'].includes(fileTypeFromExtension(primaryExtension))
      ? buildFileUrl(normalizedCategory, row.ID, primaryFile)
      : '',
    StoragePath: row.StoragePath || '',
    PrimaryFile: primaryFile
  };
}

router.get('/categories', (req, res) => {
  try {
    const requestedParent = normalizeCategory(req.query.parent);
    const allCategories = listArchiveCategories(db);
    const parent = requestedParent ? getArchiveCategory(db, requestedParent) : null;
    const categories = allCategories
      .filter((category) => parent ? Number(category.ParentID) === Number(parent.ID) : !category.ParentID)
      .map((category) => ({
      ...category,
      FileCount: db.prepare('SELECT COUNT(*) AS count FROM Archive WHERE Category = ?').get(category.KeyName).count,
      ChildCount: db.prepare('SELECT COUNT(*) AS count FROM ArchiveCategories WHERE ParentID = ? AND IsActive = 1').get(category.ID).count,
      Url: `/archive-folder.html?category=${encodeURIComponent(category.KeyName)}`
      }));
    return res.json(categories);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر تحميل مجلدات الأرشيف.' });
  }
});

router.get('/', (req, res) => {
  try {
    const requestedCategory = normalizeCategory(req.query.category);
    const rows = requestedCategory
      ? db.prepare(`
          SELECT ID, FileName, FileType, PageCount, UploadedAt, Category, Extension, StoragePath, OriginalName
          FROM Archive
          WHERE Category = ?
          ORDER BY ID DESC
        `).all(requestedCategory)
      : db.prepare(`
      SELECT ID, FileName, FileType, PageCount, UploadedAt, Category, Extension, StoragePath, OriginalName
      FROM Archive
      ORDER BY ID DESC
    `).all();

    return res.json(rows.map(serializeRow));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر قراءة ملفات الأرشيف.' });
  }
});

router.post('/upload', upload.array('files', 20), (req, res) => {
  const userName = normalize(req.user?.username || req.user?.name || 'admin');
  const role = String(req.user?.role || '').trim().toLowerCase();
  if (role !== 'admin') {
    return res.status(403).json({ message: 'لا يسمح لك برفع ملفات الأرشيف إلا مدير النظام.' });
  }

  const uploadedFiles = Array.isArray(req.files) ? req.files : [];
  if (!uploadedFiles.length) {
    return res.status(400).json({ message: 'لم يتم اختيار أي ملف للرفع.' });
  }

  const category = normalizeCategory(req.body.category || req.body.Category || 'circulars');
  if (!getArchiveCategory(db, category)) {
    return res.status(400).json({ message: 'مجلد الأرشيف المحدد غير موجود أو غير نشط.' });
  }
  const displayName = normalize(req.body.name || req.body.fileName || uploadedFiles[0].originalname.replace(/\.[^.]+$/, ''));
  const folderBase = getCategoryDirectory(category);
  fs.mkdirSync(folderBase, { recursive: true });

  try {
    const uploadedAt = getCurrentTimestamp();
    const row = db.prepare(`
      INSERT INTO Archive (FileName, FileType, PageCount, UploadedAt, Category, Extension, StoragePath, OriginalName)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const totalPageCount = uploadedFiles.reduce((sum, file) => {
      const extension = path.extname(file.originalname || '');
      return sum + countPagesForFile(file.buffer || Buffer.alloc(0), extension);
    }, 0);

    const extension = path.extname(uploadedFiles[0].originalname || '').replace(/^\./, '').toLowerCase();
    const fileType = fileTypeFromExtension(extension);
    const displayBaseName = displayName || path.basename(uploadedFiles[0].originalname, path.extname(uploadedFiles[0].originalname));
    const insertResult = row.run(displayBaseName, fileType, totalPageCount, uploadedAt, category, extension || 'file', path.join(category, String(0)), uploadedFiles[0].originalname);

    const recordId = Number(insertResult.lastInsertRowid);
    const recordDir = path.join(folderBase, String(recordId));
    fs.mkdirSync(recordDir, { recursive: true });

    uploadedFiles.forEach((file, index) => {
      const fileExt = path.extname(file.originalname || '') || '.bin';
      const serialName = `${String(index + 1).padStart(2, '0')}${fileExt}`;
      const targetPath = path.join(recordDir, serialName);
      fs.writeFileSync(targetPath, file.buffer || Buffer.alloc(0));
    });

    db.prepare(`
      UPDATE Archive
      SET StoragePath = ?, OriginalName = ?, FileName = ?
      WHERE ID = ?
    `).run(path.join(category, String(recordId)), uploadedFiles[0].originalname, displayBaseName, recordId);

    logSystem({
      userName,
      role,
      action: 'Add',
      page: 'Archive',
      details: `Uploaded archive ID=${recordId} category=${category}`
    });

    const serialized = db.prepare(`
      SELECT ID, FileName, FileType, PageCount, UploadedAt, Category, Extension, StoragePath, OriginalName
      FROM Archive WHERE ID = ? LIMIT 1
    `).get(recordId);

    return res.status(201).json({
      message: 'تم رفع الملف إلى الأرشيف بنجاح.',
      record: serializeRow(serialized)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر رفع الملف إلى الأرشيف.' });
  }
});

router.get('/preview/:category/:id', async (req, res) => {
  const category = normalizeCategory(req.params.category || 'circulars');
  const recordId = Number(req.params.id || 0);
  const row = recordId ? db.prepare(`
    SELECT ID, FileName, FileType, Extension
    FROM Archive WHERE ID = ? AND Category = ? LIMIT 1
  `).get(recordId, category) : null;

  if (!row) {
    return res.status(404).send('ملف الأرشيف غير موجود.');
  }

  const primaryFile = getPrimaryFileForRecord(category, recordId);
  const actualPath = primaryFile ? path.join(getCategoryDirectory(category), String(recordId), primaryFile) : '';
  if (!actualPath || !fs.existsSync(actualPath)) {
    return res.status(404).send('الملف الفعلي غير موجود.');
  }

  const extension = path.extname(primaryFile).replace(/^\./, '').toLowerCase();
  try {
    if (fileTypeFromExtension(extension) === 'image') {
      const source = buildFileUrl(category, recordId, primaryFile);
      return res.type('html').send(previewDocument(row.FileName, `<img src="${escapeHtml(source)}" alt="${escapeHtml(row.FileName)}">`));
    }

    if (extension === 'pdf') {
      return res.sendFile(actualPath, { headers: { 'Content-Disposition': 'inline' } });
    }

    if (extension === 'docx') {
      const result = await mammoth.convertToHtml({ path: actualPath });
      return res.type('html').send(previewDocument(row.FileName, `<main class="document-preview">${result.value}</main>`));
    }

    if (extension === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(actualPath);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(422).send('ملف Excel لا يحتوي على أوراق قابلة للعرض.');
      }

      const maxRows = Math.min(worksheet.actualRowCount || worksheet.rowCount || 1, 60);
      const maxColumns = Math.min(worksheet.actualColumnCount || worksheet.columnCount || 1, 20);
      let tableRows = '';
      for (let rowIndex = 1; rowIndex <= maxRows; rowIndex += 1) {
        let cells = '';
        for (let columnIndex = 1; columnIndex <= maxColumns; columnIndex += 1) {
          cells += `<td>${escapeHtml(worksheet.getCell(rowIndex, columnIndex).text)}</td>`;
        }
        tableRows += `<tr>${cells}</tr>`;
      }

      const table = `<table><tbody>${tableRows}</tbody></table>`;
      return res.type('html').send(previewDocument(`${row.FileName} - ${worksheet.name}`, table));
    }

    if (['txt', 'csv'].includes(extension)) {
      const text = fs.readFileSync(actualPath, 'utf8').slice(0, 200000);
      return res.type('html').send(previewDocument(row.FileName, `<pre style="white-space:pre-wrap;direction:auto">${escapeHtml(text)}</pre>`));
    }

    return res.status(415).type('html').send(previewDocument(row.FileName, `<p>لا تتوفر معاينة تلقائية لصيغة .${escapeHtml(extension)}.</p>`));
  } catch (error) {
    console.error(error);
    return res.status(500).type('html').send(previewDocument(row.FileName, '<p>تعذر إنشاء معاينة لهذا الملف.</p>'));
  }
});

router.get('/download/:category/:id', (req, res) => {
  const category = normalizeCategory(req.params.category || 'circulars');
  const recordId = Number(req.params.id || 0);
  if (!recordId) {
    return res.status(400).json({ message: 'معرّف الملف غير صالح.' });
  }

  const row = db.prepare(`
    SELECT ID, FileName, FileType, PageCount, UploadedAt, Category, Extension, StoragePath, OriginalName
    FROM Archive
    WHERE ID = ? AND Category = ?
    LIMIT 1
  `).get(recordId, category);

  if (!row) {
    return res.status(404).json({ message: 'ملف الأرشيف غير موجود.' });
  }

  const files = listFilesForRecord(category, recordId);
  const primaryFile = files[0];
  if (!primaryFile) {
    return res.status(404).json({ message: 'لا يوجد ملف فعلي لهذا السجل.' });
  }

  const actualPath = path.join(getCategoryDirectory(category), String(recordId), primaryFile);
  if (!fs.existsSync(actualPath)) {
    return res.status(404).json({ message: 'الملف غير موجود في المجلد المحلي.' });
  }

  return res.download(actualPath, primaryFile);
});

module.exports = router;
module.exports.archiveRoot = archiveRoot;
