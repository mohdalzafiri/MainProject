const express = require('express');
const { db, logSystem, getCurrentTimestamp } = require('../database');

const router = express.Router();
const tableName = 'OutgoingDocuments';

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

function buildInsertStatement(payload) {
  const keys = ['DocNumber', 'DocDate', 'Subject', 'Recipient', 'Notes', 'UserName', 'CreatedAt', 'UpdatedAt']
    .filter((column) => Object.prototype.hasOwnProperty.call(payload, column));

  if (!keys.length) return null;

  return {
    sql: `INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    values: keys.map((key) => payload[key])
  };
}

function buildUpdateStatement(payload, id) {
  const keys = ['DocNumber', 'DocDate', 'Subject', 'Recipient', 'Notes', 'UserName', 'CreatedAt', 'UpdatedAt']
    .filter((column) => Object.prototype.hasOwnProperty.call(payload, column));

  if (!keys.length) return null;

  return {
    sql: `UPDATE ${tableName} SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE ID = ?`,
    values: [...keys.map((key) => payload[key]), id]
  };
}

router.get('/', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT ID, DocNumber, DocDate, Subject, Recipient, Notes, UserName, CreatedAt, UpdatedAt
      FROM ${tableName}
      ORDER BY DocDate DESC, ID DESC
      LIMIT 1000
    `).all();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل بيانات الصادر.' });
  }
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف السجل غير صالح.' });
  }

  try {
    const row = db.prepare(`
      SELECT ID, DocNumber, DocDate, Subject, Recipient, Notes, UserName, CreatedAt, UpdatedAt
      FROM ${tableName}
      WHERE ID = ?
      LIMIT 1
    `).get(id);

    return row ? res.json(row) : res.status(404).json({ message: 'السجل غير موجود.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر قراءة بيانات الصادر.' });
  }
});

router.post('/', (req, res) => {
  const docNumber = normalize(req.body.DocNumber);
  const docDate = formatDateOnly(req.body.DocDate);
  const subject = normalize(req.body.Subject);
  const recipient = normalize(req.body.Recipient);
  const notes = normalize(req.body.Notes);
  const userName = normalize(req.body.UserName) || req.user?.name || req.user?.username || 'system';

  if (!docNumber) return res.status(400).json({ message: 'رقم الصادر مطلوب.' });
  if (!docDate) return res.status(400).json({ message: 'تاريخ الصادر مطلوب.' });
  if (!subject) return res.status(400).json({ message: 'الموضوع مطلوب.' });
  if (!recipient) return res.status(400).json({ message: 'الجهة المرسل لها مطلوبة.' });

  const timestamp = getTimestamp();

  try {
    const result = db.prepare(`
      INSERT INTO ${tableName} (DocNumber, DocDate, Subject, Recipient, Notes, UserName, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(docNumber, docDate, subject, recipient, notes, userName, timestamp, timestamp);

    logSystem({
      userName,
      action: 'Add',
      page: 'Outgoing',
      details: `Added outgoing ID=${result.lastInsertRowid}`
    });

    res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر إضافة بيانات الصادر.' });
  }
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف السجل غير صالح.' });
  }

  const docNumber = normalize(req.body.DocNumber);
  const docDate = formatDateOnly(req.body.DocDate);
  const subject = normalize(req.body.Subject);
  const recipient = normalize(req.body.Recipient);
  const notes = normalize(req.body.Notes);
  const userName = normalize(req.body.UserName) || req.user?.name || req.user?.username || 'system';

  if (!docNumber) return res.status(400).json({ message: 'رقم الصادر مطلوب.' });
  if (!docDate) return res.status(400).json({ message: 'تاريخ الصادر مطلوب.' });
  if (!subject) return res.status(400).json({ message: 'الموضوع مطلوب.' });
  if (!recipient) return res.status(400).json({ message: 'الجهة المرسل لها مطلوبة.' });

  const timestamp = getTimestamp();

  try {
    const result = db.prepare(`
      UPDATE ${tableName}
      SET DocNumber = ?, DocDate = ?, Subject = ?, Recipient = ?, Notes = ?, UserName = ?, UpdatedAt = ?
      WHERE ID = ?
    `).run(docNumber, docDate, subject, recipient, notes, userName, timestamp, id);

    if (result.changes === 0) {
      return res.status(404).json({ message: 'السجل غير موجود للتعديل.' });
    }

    logSystem({
      userName,
      action: 'Update',
      page: 'Outgoing',
      details: `Updated outgoing ID=${id}`
    });

    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تعديل بيانات الصادر.' });
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
      page: 'Outgoing',
      details: `Deleted outgoing ID=${id}`
    });

    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر حذف بيانات الصادر.' });
  }
});

module.exports = router;
