const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { db, logSystem } = require('../database');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const moduleConfig = {
  holidays: { table: 'Holiday', pageKey: 'holidays', pageName: 'Holiday' },
  courses: { table: 'Course', pageKey: 'courses', pageName: 'Course' },
  transfers: { table: 'Transfer', pageKey: 'transfers', pageName: 'Transfer' },
  outgoing: { table: 'OutgoingDocuments', pageKey: 'outgoing', pageName: 'Outgoing' },
  incoming: { table: 'IncomingDocuments', pageKey: 'incoming', pageName: 'Incoming' }
};

function parseRecordId(rawValue) {
  const value = Number(rawValue || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeModule(rawValue) {
  return String(rawValue || '').trim().toLowerCase();
}

function resolveModuleConfig(moduleKey) {
  return moduleConfig[moduleKey] || null;
}

function getRecordDirectory(moduleKey, recordId) {
  return path.join(__dirname, '..', 'public', 'generated', moduleKey, String(recordId));
}

function ensureAllowed(req, moduleKey, method) {
  const config = resolveModuleConfig(moduleKey);
  if (!config) {
    return { ok: false, status: 404, message: 'نوع الواجهة غير مدعوم للمرفقات.' };
  }

  const role = String(req.user?.role || '').trim().toLowerCase();
  const isAdmin = role === 'admin';
  const isViewOnly = role === 'view';
  const allowedPages = Array.isArray(req.user?.allowedPages) ? req.user.allowedPages : [];

  if (!isAdmin && !allowedPages.includes(config.pageKey)) {
    return { ok: false, status: 403, message: 'غير مصرح لك بالوصول لمرفقات هذه الواجهة.' };
  }

  if (isViewOnly && method !== 'GET' && method !== 'HEAD') {
    return { ok: false, status: 403, message: 'صلاحيتك الحالية للعرض فقط ولا تسمح برفع الصور.' };
  }

  return { ok: true, config };
}

function ensureRecordExists(config, recordId) {
  const row = db.prepare(`SELECT ID FROM ${config.table} WHERE ID = ? LIMIT 1`).get(recordId);
  return Boolean(row);
}

function readImageFiles(moduleKey, recordId) {
  const directory = getRecordDirectory(moduleKey, recordId);
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = fs.readdirSync(directory)
    .filter((name) => /^\d{3}\.jpg$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return files.map((fileName) => ({
    fileName,
    url: `/generated/${moduleKey}/${recordId}/${fileName}`
  }));
}

function getNextFileName(moduleKey, recordId) {
  const images = readImageFiles(moduleKey, recordId);
  const maxIndex = images.reduce((maxValue, item) => {
    const match = String(item.fileName || '').match(/^(\d{3})\.jpg$/i);
    if (!match) return maxValue;
    const current = Number(match[1]);
    return current > maxValue ? current : maxValue;
  }, 0);

  const nextIndex = maxIndex + 1;
  return `${String(nextIndex).padStart(3, '0')}.jpg`;
}

router.get('/:module/:recordId', (req, res) => {
  const moduleKey = normalizeModule(req.params.module);
  const recordId = parseRecordId(req.params.recordId);

  const access = ensureAllowed(req, moduleKey, 'GET');
  if (!access.ok) {
    return res.status(access.status).json({ message: access.message });
  }

  if (!recordId) {
    return res.status(400).json({ message: 'معرّف السجل غير صالح.' });
  }

  if (!ensureRecordExists(access.config, recordId)) {
    return res.status(404).json({ message: 'السجل المطلوب غير موجود.' });
  }

  const images = readImageFiles(moduleKey, recordId);
  return res.json({ images, total: images.length });
});

router.post('/:module/:recordId', upload.single('image'), (req, res) => {
  const moduleKey = normalizeModule(req.params.module);
  const recordId = parseRecordId(req.params.recordId);

  const access = ensureAllowed(req, moduleKey, 'POST');
  if (!access.ok) {
    return res.status(access.status).json({ message: access.message });
  }

  if (!recordId) {
    return res.status(400).json({ message: 'معرّف السجل غير صالح.' });
  }

  if (!ensureRecordExists(access.config, recordId)) {
    return res.status(404).json({ message: 'السجل المطلوب غير موجود.' });
  }

  if (!req.file) {
    return res.status(400).json({ message: 'لم يتم استلام صورة للرفع.' });
  }

  const mimeType = String(req.file.mimetype || '').toLowerCase();
  if (!mimeType.startsWith('image/')) {
    return res.status(400).json({ message: 'الملف المرفوع ليس صورة.' });
  }

  try {
    const targetDir = getRecordDirectory(moduleKey, recordId);
    fs.mkdirSync(targetDir, { recursive: true });

    const fileName = getNextFileName(moduleKey, recordId);
    const targetFile = path.join(targetDir, fileName);
    fs.writeFileSync(targetFile, req.file.buffer);

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Upload',
      page: access.config.pageName,
      details: `Uploaded attachment ${moduleKey}/${recordId}/${fileName}`
    });

    return res.json({
      fileName,
      url: `/generated/${moduleKey}/${recordId}/${fileName}`
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر حفظ صورة المستند.' });
  }
});

module.exports = router;
