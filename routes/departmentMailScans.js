const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, logSystem } = require('../database');
const { isWithinDataScope } = require('../auth/dataScope');
const { getSafeFilePart } = require('../utils/dailyScanNaming');
const { getDepartmentMailScanFileName } = require('../utils/departmentMailScanNaming');
const { receivePdfScan, isPdfScanFile } = require('../services/pdfScanUpload');
const {
  departmentMailScanRoot,
  getDepartmentMailScanDirectory,
  ensureDepartmentMailScanDirectory,
  getDepartmentMailScanKey
} = require('../services/departmentMailScanStorage');

const router = express.Router();
const indexFileName = '_department-mail-index.json';

function parseRecordId(value) {
  const id = Number(value || 0);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function getIndexPath() {
  return path.join(departmentMailScanRoot, indexFileName);
}

function readIndex() {
  const indexPath = getIndexPath();
  if (!fs.existsSync(indexPath)) return {};
  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Department mail scan index is invalid: ${indexPath}`);
  }
  return parsed;
}

function writeIndex(index) {
  fs.mkdirSync(departmentMailScanRoot, { recursive: true });
  const indexPath = getIndexPath();
  const temporaryPath = `${indexPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(index, null, 2), 'utf8');
  try {
    fs.copyFileSync(temporaryPath, indexPath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function getAssignment(record) {
  const assignment = readIndex()[getDepartmentMailScanKey(record)];
  if (!assignment) return null;

  const departmentFolder = getSafeFilePart(assignment.department, 'قسم');
  const sectionFolder = getSafeFilePart(assignment.section, 'نوبة');
  const fileName = path.basename(String(assignment.fileName || '').trim());
  if (!fileName || fileName !== assignment.fileName || !fileName.toLowerCase().endsWith('.pdf')) {
    throw new Error(`Department mail scan filename is invalid for record ${record.ID}`);
  }

  return {
    ...assignment,
    fileName,
    filePath: path.join(departmentMailScanRoot, departmentFolder, sectionFolder, fileName)
  };
}

function getNextFile(record, createdAt) {
  const directory = getDepartmentMailScanDirectory(record);
  let sequence = 1;
  let fileName = getDepartmentMailScanFileName(record, createdAt, sequence);
  while (fs.existsSync(path.join(directory, fileName))) {
    sequence += 1;
    fileName = getDepartmentMailScanFileName(record, createdAt, sequence);
  }
  return { fileName, filePath: path.join(directory, fileName), sequence };
}

async function getAuthorizedRecord(req, res, method) {
  const id = parseRecordId(req.params.recordId);
  if (!id) {
    res.status(400).json({ message: 'معرّف سجل بريد الأقسام غير صالح.' });
    return null;
  }

  const access = req.access || {};
  if (!access.isAdmin && !Array.isArray(access.allowedPages)) {
    res.status(403).json({ message: 'غير مصرح لك بالوصول إلى ملفات بريد الأقسام.' });
    return null;
  }
  if (!access.isAdmin && method !== 'GET'
    && (access.isViewOnly || !Array.isArray(access.editablePages) || !access.editablePages.includes('departmentMail'))) {
    res.status(403).json({ message: 'لا تملك صلاحية إضافة أو حذف ملفات بريد الأقسام.' });
    return null;
  }

  const record = await db.prepare(`
    SELECT ID, MailNumber, MailDate, Subject, Department, Section
    FROM DepartmentMail
    WHERE ID = ?
    LIMIT 1
  `).get(id);
  if (!record || !isWithinDataScope(record, access)) {
    res.status(404).json({ message: 'سجل بريد الأقسام غير موجود أو غير متاح ضمن نطاق صلاحيتك.' });
    return null;
  }
  return { id, record };
}

router.get('/:recordId', async (req, res) => {
  const target = await getAuthorizedRecord(req, res, 'GET');
  if (!target) return;

  try {
    const assignment = getAssignment(target.record);
    const exists = Boolean(assignment && fs.existsSync(assignment.filePath));
    return res.json({
      exists,
      fileName: exists ? assignment.fileName : '',
      departmentFolder: getSafeFilePart(target.record.Department, 'قسم'),
      sectionFolder: getSafeFilePart(target.record.Section, 'نوبة')
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر قراءة ملف بريد الأقسام المحفوظ.' });
  }
});

router.get('/:recordId/pdf', async (req, res) => {
  const target = await getAuthorizedRecord(req, res, 'GET');
  if (!target) return;

  let assignment;
  try {
    assignment = getAssignment(target.record);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر قراءة بيانات ملف بريد الأقسام.' });
  }
  if (!assignment || !fs.existsSync(assignment.filePath)) {
    return res.status(404).json({ message: 'لا يوجد ملف PDF لهذا السجل.' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="department-mail.pdf"; filename*=UTF-8''${encodeURIComponent(assignment.fileName)}`);
  const stream = fs.createReadStream(assignment.filePath);
  stream.on('error', (error) => {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ message: 'تعذر قراءة ملف PDF.' });
    else res.destroy(error);
  });
  return stream.pipe(res);
});

router.post('/:recordId', receivePdfScan, async (req, res) => {
  const target = await getAuthorizedRecord(req, res, 'POST');
  if (!target) return;
  if (!isPdfScanFile(req.file)) {
    return res.status(400).json({ message: 'الملف المرفوع ليس ملف PDF صالحًا.' });
  }

  const createdAt = new Date();
  const nextFile = getNextFile(target.record, createdAt);
  const temporaryPath = `${nextFile.filePath}.${process.pid}.${Date.now()}.tmp`;
  let previousAssignment = null;

  try {
    ensureDepartmentMailScanDirectory(target.record);
    previousAssignment = getAssignment(target.record);
    fs.writeFileSync(temporaryPath, req.file.buffer);
    fs.renameSync(temporaryPath, nextFile.filePath);

    const index = readIndex();
    index[getDepartmentMailScanKey(target.record)] = {
      fileName: nextFile.fileName,
      createdAt: createdAt.toISOString(),
      sequence: nextFile.sequence,
      department: String(target.record.Department || '').trim(),
      section: String(target.record.Section || '').trim()
    };
    try {
      writeIndex(index);
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
      page: 'DepartmentMail',
      details: `Uploaded department mail scan PDF ${target.record.Department}/${target.record.Section}/${nextFile.fileName}`
    });
    return res.json({
      fileName: nextFile.fileName,
      departmentFolder: getSafeFilePart(target.record.Department, 'قسم'),
      sectionFolder: getSafeFilePart(target.record.Section, 'نوبة')
    });
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    console.error(error);
    return res.status(500).json({ message: 'تعذر حفظ ملف PDF داخل مجلد القسم والنوبة.' });
  }
});

router.delete('/:recordId', async (req, res) => {
  const target = await getAuthorizedRecord(req, res, 'DELETE');
  if (!target) return;

  try {
    const assignment = getAssignment(target.record);
    if (!assignment || !fs.existsSync(assignment.filePath)) {
      return res.status(404).json({ message: 'لا يوجد ملف PDF لهذا السجل لحذفه.' });
    }

    const deletedPath = `${assignment.filePath}.${process.pid}.${Date.now()}.deleted`;
    fs.renameSync(assignment.filePath, deletedPath);
    try {
      const index = readIndex();
      delete index[getDepartmentMailScanKey(target.record)];
      writeIndex(index);
      fs.unlinkSync(deletedPath);
    } catch (error) {
      if (fs.existsSync(deletedPath)) fs.renameSync(deletedPath, assignment.filePath);
      throw error;
    }

    await logSystem({
      userName: req.user.username || 'system',
      role: req.user.role || '',
      action: 'Delete',
      page: 'DepartmentMail',
      details: `Deleted department mail scan PDF ${assignment.fileName}`
    });
    return res.json({ message: 'تم حذف ملف PDF الخاص ببريد الأقسام بنجاح.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر حذف ملف PDF الخاص ببريد الأقسام.' });
  }
});

module.exports = router;
