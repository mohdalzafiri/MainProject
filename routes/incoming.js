const express = require('express');
const { db, logSystem, getCurrentTimestamp } = require('../database');

const router = express.Router();
const tableName = 'IncomingDocuments';

function normalize(value) {
  return String(value || '').trim();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateOnly(dateValue) {
  const raw = String(dateValue || '').trim();
  if (!raw) return '';

  const normalized = raw.replace(/-/g, '/');
  const isoMatch = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!year || !month || !day) return '';
    return `${year}/${pad2(month)}/${pad2(day)}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
}

function getTimestamp() {
  return getCurrentTimestamp();
}

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT ID, DocNumber, DocDate, BookNumber, BookDate, Subject, SourceDepartment, SpecialDepartment, Notes, UserName, CreatedAt, UpdatedAt
      FROM ${tableName}
      ORDER BY DocDate DESC, ID DESC
      LIMIT 1000
    `).all();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل بيانات الوارد.' });
  }
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف السجل غير صالح.' });
  }

  try {
    const row = db.prepare(`
      SELECT ID, DocNumber, DocDate, BookNumber, BookDate, Subject, SourceDepartment, SpecialDepartment, Notes, UserName, CreatedAt, UpdatedAt
      FROM ${tableName}
      WHERE ID = ?
      LIMIT 1
    `).get(id);

    return row ? res.json(row) : res.status(404).json({ message: 'السجل غير موجود.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر قراءة بيانات الوارد.' });
  }
});

router.post('/', (req, res) => {
  const docNumber = normalize(req.body.DocNumber);
  const docDate = formatDateOnly(req.body.DocDate);
  const bookNumber = normalize(req.body.BookNumber);
  const bookDate = formatDateOnly(req.body.BookDate);
  const subject = normalize(req.body.Subject);
  const sourceDepartment = normalize(req.body.SourceDepartment);
  const specialDepartment = normalize(req.body.SpecialDepartment);
  const notes = normalize(req.body.Notes);
  const userName = normalize(req.body.UserName) || req.user?.name || req.user?.username || 'system';

  if (!docNumber) return res.status(400).json({ message: 'رقم الوارد مطلوب.' });
  if (!docDate) return res.status(400).json({ message: 'تاريخ الوارد مطلوب.' });
  if (!bookNumber) return res.status(400).json({ message: 'رقم الكتاب الوارد مطلوب.' });
  if (!bookDate) return res.status(400).json({ message: 'تاريخ الكتاب الوارد مطلوب.' });
  if (!subject) return res.status(400).json({ message: 'الموضوع مطلوب.' });
  if (!sourceDepartment) return res.status(400).json({ message: 'الجهة الوارد منها مطلوبة.' });
  if (!specialDepartment) return res.status(400).json({ message: 'القسم المختص مطلوب.' });

  const timestamp = getTimestamp();

  try {
    const result = db.prepare(`
      INSERT INTO ${tableName} (
        DocNumber, DocDate, BookNumber, BookDate, Subject, SourceDepartment, SpecialDepartment, Notes, UserName, CreatedAt, UpdatedAt
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docNumber,
      docDate,
      bookNumber,
      bookDate,
      subject,
      sourceDepartment,
      specialDepartment,
      notes,
      userName,
      timestamp,
      timestamp
    );

    logSystem({
      userName,
      action: 'Add',
      page: 'Incoming',
      details: `Added incoming ID=${result.lastInsertRowid}`
    });

    res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر إضافة بيانات الوارد.' });
  }
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف السجل غير صالح.' });
  }

  const docNumber = normalize(req.body.DocNumber);
  const docDate = formatDateOnly(req.body.DocDate);
  const bookNumber = normalize(req.body.BookNumber);
  const bookDate = formatDateOnly(req.body.BookDate);
  const subject = normalize(req.body.Subject);
  const sourceDepartment = normalize(req.body.SourceDepartment);
  const specialDepartment = normalize(req.body.SpecialDepartment);
  const notes = normalize(req.body.Notes);
  const userName = normalize(req.body.UserName) || req.user?.name || req.user?.username || 'system';

  if (!docNumber) return res.status(400).json({ message: 'رقم الوارد مطلوب.' });
  if (!docDate) return res.status(400).json({ message: 'تاريخ الوارد مطلوب.' });
  if (!bookNumber) return res.status(400).json({ message: 'رقم الكتاب الوارد مطلوب.' });
  if (!bookDate) return res.status(400).json({ message: 'تاريخ الكتاب الوارد مطلوب.' });
  if (!subject) return res.status(400).json({ message: 'الموضوع مطلوب.' });
  if (!sourceDepartment) return res.status(400).json({ message: 'الجهة الوارد منها مطلوبة.' });
  if (!specialDepartment) return res.status(400).json({ message: 'القسم المختص مطلوب.' });

  const timestamp = getTimestamp();

  try {
    const result = db.prepare(`
      UPDATE ${tableName}
      SET DocNumber = ?, DocDate = ?, BookNumber = ?, BookDate = ?, Subject = ?, SourceDepartment = ?, SpecialDepartment = ?, Notes = ?, UserName = ?, UpdatedAt = ?
      WHERE ID = ?
    `).run(
      docNumber,
      docDate,
      bookNumber,
      bookDate,
      subject,
      sourceDepartment,
      specialDepartment,
      notes,
      userName,
      timestamp,
      id
    );

    if (result.changes === 0) {
      return res.status(404).json({ message: 'السجل غير موجود للتعديل.' });
    }

    logSystem({
      userName,
      action: 'Update',
      page: 'Incoming',
      details: `Updated incoming ID=${id}`
    });

    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تعديل بيانات الوارد.' });
  }
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف السجل غير صالح.' });
  }

  try {
    const result = db.prepare(`DELETE FROM ${tableName} WHERE ID = ?`).run(id);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'السجل غير موجود للحذف.' });
    }

    logSystem({
      userName: normalize(req.body.userName) || req.user?.name || req.user?.username || 'system',
      action: 'Delete',
      page: 'Incoming',
      details: `Deleted incoming ID=${id}`
    });

    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر حذف بيانات الوارد.' });
  }
});

module.exports = router;
