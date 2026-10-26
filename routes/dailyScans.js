const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, isValidDailyTable, logSystem } = require('../database');
const { isWithinDataScope } = require('../auth/dataScope');
const { getDailyScanFileName, getSafeFilePart } = require('../utils/dailyScanNaming');
const { receivePdfScan, isPdfScanFile } = require('../services/pdfScanUpload');
const {
  getDailyScanSectionDirectory,
  ensureDailyScanSectionDirectory,
  getDailyScanKey
} = require('../services/dailyScanStorage');

const router = express.Router();
const indexFileName = '_daily-index.json';

function parseRecordId(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function normalizeDailyDate(value) {
  return String(value || '').trim().replace(/\//g, '-');
}

function getSectionDirectory(record) {
  return getDailyScanSectionDirectory(record.Section);
}

function getIndexPath(record) {
  return path.join(getSectionDirectory(record), indexFileName);
}

function readIndex(record) {
  const indexPath = getIndexPath(record);
  if (!fs.existsSync(indexPath)) return {};

  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Daily scan index is invalid: ${indexPath}`);
  }
  return parsed;
}

function writeIndex(record, index) {
  const directory = getSectionDirectory(record);
  const indexPath = getIndexPath(record);
  const temporaryPath = `${indexPath}.${process.pid}.${Date.now()}.tmp`;
  ensureDailyScanSectionDirectory(record.Section);
  fs.writeFileSync(temporaryPath, JSON.stringify(index, null, 2), 'utf8');
  try {
    fs.copyFileSync(temporaryPath, indexPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function getAssignment(record) {
  const index = readIndex(record);
  const assignment = index[getDailyScanKey(record)];
  if (!assignment) return null;

  const fileName = path.basename(String(assignment.fileName || '').trim());
  if (!fileName || fileName !== assignment.fileName || !fileName.toLowerCase().endsWith('.pdf')) {
    throw new Error(`Daily scan filename is invalid for ${getDailyScanKey(record)}`);
  }

  return {
    ...assignment,
    fileName,
    filePath: path.join(getSectionDirectory(record), fileName)
  };
}

function getNextFile(record, createdAt) {
  const directory = getSectionDirectory(record);
  let sequence = 1;
  let fileName = getDailyScanFileName(record, createdAt, sequence);
  while (fs.existsSync(path.join(directory, fileName))) {
    sequence += 1;
    fileName = getDailyScanFileName(record, createdAt, sequence);
  }
  return {
    fileName,
    filePath: path.join(directory, fileName),
    sequence
  };
}

async function getAuthorizedRecord(req, res, method) {
  const table = String(req.params.table || '');
  const id = parseRecordId(req.params.recordId);
  if (!isValidDailyTable(table) || !id) {
    res.status(400).json({ message: 'معرّف سجل اليومية غير صالح.' });
    return null;
  }

  const access = req.access || {};
  if (!access.isAdmin && !Array.isArray(access.allowedPages)) {
    res.status(403).json({ message: 'غير مصرح لك بالوصول إلى ملفات اليومية.' });
    return null;
  }
  if (!access.isAdmin && method !== 'GET'
    && (access.isViewOnly || !Array.isArray(access.editablePages) || !access.editablePages.includes('daily'))) {
    res.status(403).json({ message: 'لا تملك صلاحية إضافة أو حذف ملفات اليومية.' });
    return null;
  }

  const record = await db.prepare(`
    SELECT ID, Name, Today, Department, Section, Period
    FROM ${table}
    WHERE ID = ?
    LIMIT 1
  `).get(id);
  if (!record || !isWithinDataScope(record, access)) {
    res.status(404).json({ message: 'سجل اليومية غير موجود أو غير متاح ضمن نطاق صلاحيتك.' });
    return null;
  }

  return { table, id, record };
}

router.get('/:table/:recordId', async (req, res) => {
  const target = await getAuthorizedRecord(req, res, 'GET');
  if (!target) return;

  try {
    const assignment = getAssignment(target.record);
    const exists = Boolean(assignment && fs.existsSync(assignment.filePath));
    return res.json({
      exists,
      fileName: exists ? assignment.fileName : '',
      sectionFolder: getSafeFilePart(target.record.Section, 'نوبة')
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر قراءة ملف اليومية المحفوظ.' });
  }
});

router.get('/:table/:recordId/pdf', async (req, res) => {
  const target = await getAuthorizedRecord(req, res, 'GET');
  if (!target) return;

  let assignment;
  try {
    assignment = getAssignment(target.record);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر قراءة بيانات ملف اليومية.' });
  }
  if (!assignment || !fs.existsSync(assignment.filePath)) {
    return res.status(404).json({ message: 'لا يوجد ملف PDF لهذه اليومية.' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="daily-scan.pdf"; filename*=UTF-8''${encodeURIComponent(assignment.fileName)}`);
  const stream = fs.createReadStream(assignment.filePath);
  stream.on('error', (error) => {
    console.error(error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'تعذر قراءة ملف PDF الخاص باليومية.' });
    } else {
      res.destroy(error);
    }
  });
  return stream.pipe(res);
});

router.post('/:table/:recordId', receivePdfScan, async (req, res) => {
  const target = await getAuthorizedRecord(req, res, 'POST');
  if (!target) return;
  if (!isPdfScanFile(req.file)) {
    return res.status(400).json({ message: 'الملف المرفوع ليس ملف PDF صالحًا.' });
  }

  const directory = getSectionDirectory(target.record);
  const createdAt = new Date();
  const nextFile = getNextFile(target.record, createdAt);
  const temporaryPath = `${nextFile.filePath}.${process.pid}.${Date.now()}.tmp`;
  let previousAssignment = null;

  try {
    ensureDailyScanSectionDirectory(target.record.Section);
    previousAssignment = getAssignment(target.record);
    fs.writeFileSync(temporaryPath, req.file.buffer);
    fs.renameSync(temporaryPath, nextFile.filePath);

    const index = readIndex(target.record);
    index[getDailyScanKey(target.record)] = {
      fileName: nextFile.fileName,
      createdAt: createdAt.toISOString(),
      sequence: nextFile.sequence,
      today: normalizeDailyDate(target.record.Today),
      department: String(target.record.Department || '').trim(),
      section: String(target.record.Section || '').trim(),
      period: String(target.record.Period || '').trim()
    };

    try {
      writeIndex(target.record, index);
    } catch (error) {
      if (fs.existsSync(nextFile.filePath)) fs.unlinkSync(nextFile.filePath);
      throw error;
    }

    if (previousAssignment
      && previousAssignment.filePath !== nextFile.filePath
      && fs.existsSync(previousAssignment.filePath)) {
      fs.unlinkSync(previousAssignment.filePath);
    }

    await logSystem({
      userName: req.user.username || 'system',
      role: req.user.role || '',
      action: 'Upload',
      page: target.table,
      details: `Uploaded daily scan PDF ${target.record.Section}/${nextFile.fileName}`
    });
    return res.json({
      fileName: nextFile.fileName,
      sectionFolder: getSafeFilePart(target.record.Section, 'نوبة')
    });
  } catch (error) {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    } catch (cleanupError) {
      console.error('Unable to clean up temporary daily scan:', cleanupError);
    }
    console.error(error);
    return res.status(500).json({ message: 'تعذر حفظ ملف PDF داخل مجلد النوبة.' });
  }
});

router.delete('/:table/:recordId', async (req, res) => {
  const target = await getAuthorizedRecord(req, res, 'DELETE');
  if (!target) return;

  let assignment;
  try {
    assignment = getAssignment(target.record);
    if (!assignment || !fs.existsSync(assignment.filePath)) {
      return res.status(404).json({ message: 'لا يوجد ملف PDF لهذه اليومية لحذفه.' });
    }

    const deletedPath = `${assignment.filePath}.${process.pid}.${Date.now()}.deleted`;
    fs.renameSync(assignment.filePath, deletedPath);
    try {
      const index = readIndex(target.record);
      delete index[getDailyScanKey(target.record)];
      writeIndex(target.record, index);
      fs.unlinkSync(deletedPath);
    } catch (error) {
      if (fs.existsSync(deletedPath)) fs.renameSync(deletedPath, assignment.filePath);
      throw error;
    }

    await logSystem({
      userName: req.user.username || 'system',
      role: req.user.role || '',
      action: 'Delete',
      page: target.table,
      details: `Deleted daily scan PDF ${target.record.Section}/${assignment.fileName}`
    });
    return res.json({ message: 'تم حذف ملف PDF الخاص باليومية بنجاح.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر حذف ملف PDF الخاص باليومية.' });
  }
});

module.exports = router;
