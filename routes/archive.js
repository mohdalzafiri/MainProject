const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db, logSystem, getCurrentTimestamp } = require('../database');

const router = express.Router();
const categoryLabels = {
  general: 'تعاميم',
  reports: 'كشوف'
};

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
  const key = normalize(value).toLowerCase();
  if (key === 'reports' || key === 'kshouf' || key === 'كشوف') return 'reports';
  return 'general';
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

function countPagesForFile(fileBuffer, extension) {
  const ext = (extension || '').toLowerCase().replace(/^\./, '');
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
    return 1;
  }

  if (ext === 'pdf') {
    const bufferText = fileBuffer.toString('latin1');
    const typePageMatches = [...bufferText.matchAll(/\/Type\s*\/Page/gi)];
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

function buildFileUrl(category, id, fileName) {
  return `/archive-files/${encodeURIComponent(category)}/${encodeURIComponent(String(id))}/${encodeURIComponent(fileName)}`;
}

function listFilesForRecord(category, recordId) {
  const recordDirectory = path.join(archiveRoot, category, String(recordId));
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
  const category = String(row.Category || 'general');
  const normalizedCategory = normalizeCategory(category);
  const fileName = String(row.FileName || '').trim() || String(row.OriginalName || '').trim();
  const primaryFile = getPrimaryFileForRecord(normalizedCategory, row.ID);
  const url = `/api/archive/download/${encodeURIComponent(normalizedCategory)}/${encodeURIComponent(String(row.ID))}`;

  return {
    ID: Number(row.ID),
    FileName: fileName,
    FileType: String(row.FileType || 'file'),
    PageCount: Number(row.PageCount || 0),
    UploadedAt: row.UploadedAt,
    Category: normalizedCategory,
    CategoryLabel: categoryLabels[normalizedCategory] || 'تعاميم',
    Extension: String(row.Extension || '').replace(/^\./, '').toLowerCase(),
    DownloadUrl: url,
    ThumbnailUrl: primaryFile ? `/archive-files/${normalizedCategory}/${row.ID}/${encodeURIComponent(primaryFile)}` : url,
    StoragePath: row.StoragePath || '',
    PrimaryFile: primaryFile
  };
}

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
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

  const category = normalizeCategory(req.body.category || req.body.Category || 'general');
  const displayName = normalize(req.body.name || req.body.fileName || uploadedFiles[0].originalname.replace(/\.[^.]+$/, ''));
  const folderBase = path.join(archiveRoot, category);
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

router.get('/download/:category/:id', (req, res) => {
  const category = normalizeCategory(req.params.category || 'general');
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

  const actualPath = path.join(archiveRoot, category, String(recordId), primaryFile);
  if (!fs.existsSync(actualPath)) {
    return res.status(404).json({ message: 'الملف غير موجود في المجلد المحلي.' });
  }

  return res.download(actualPath, primaryFile);
});

module.exports = router;
module.exports.archiveRoot = archiveRoot;
