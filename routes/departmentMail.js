const express = require('express');
const {
  db,
  logSystem,
  getCurrentTimestamp,
  registerDatabaseInitializer
} = require('../database');
const { filterByDataScope, isWithinDataScope } = require('../auth/dataScope');

const router = express.Router();
const tableName = 'DepartmentMail';

function normalize(value) {
  return String(value || '').trim();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatDateOnly(value) {
  const raw = normalize(value).replace(/-/g, '/');
  const match = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${year}/${pad2(month)}/${pad2(day)}`;
}

async function ensureDepartmentMailTable() {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      MailNumber TEXT NOT NULL,
      MailDate TEXT NOT NULL,
      Subject TEXT NOT NULL,
      Department TEXT NOT NULL,
      Section TEXT NOT NULL,
      Notes TEXT,
      UserName TEXT,
      CreatedAt TEXT NOT NULL,
      UpdatedAt TEXT NOT NULL
    )
  `).run();
}

registerDatabaseInitializer(ensureDepartmentMailTable);

function getUserName(req) {
  return normalize(req.body.UserName)
    || normalize(req.user && req.user.name)
    || normalize(req.user && req.user.username)
    || 'system';
}

function validatePayload(req, res) {
  const payload = {
    MailNumber: normalize(req.body.MailNumber),
    MailDate: formatDateOnly(req.body.MailDate),
    Subject: normalize(req.body.Subject),
    Department: normalize(req.body.Department),
    Section: normalize(req.body.Section),
    Notes: normalize(req.body.Notes),
    UserName: getUserName(req)
  };

  if (!payload.MailNumber) res.status(400).json({ message: 'رقم البريد مطلوب.' });
  else if (!payload.MailDate) res.status(400).json({ message: 'تاريخ البريد مطلوب.' });
  else if (!payload.Subject) res.status(400).json({ message: 'الموضوع مطلوب.' });
  else if (!payload.Department) res.status(400).json({ message: 'القسم مطلوب.' });
  else if (!payload.Section) res.status(400).json({ message: 'النوبة مطلوبة.' });
  else if (!isWithinDataScope(payload, req.access)) {
    res.status(403).json({ message: 'القسم أو النوبة خارج نطاق صلاحيات المستخدم.' });
  } else {
    return payload;
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT ID, MailNumber, MailDate, Subject, Department, Section, Notes, UserName, CreatedAt, UpdatedAt
      FROM ${tableName}
      ORDER BY MailDate DESC, ID DESC
      LIMIT 1000
    `).all();
    res.json(filterByDataScope(rows, req.access));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل بيانات بريد الأقسام.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'معرّف السجل غير صالح.' });

  try {
    const row = await db.prepare(`SELECT * FROM ${tableName} WHERE ID = ? LIMIT 1`).get(id);
    return row && isWithinDataScope(row, req.access)
      ? res.json(row)
      : res.status(404).json({ message: 'السجل غير موجود.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر قراءة بيانات بريد الأقسام.' });
  }
});

router.post('/', async (req, res) => {
  const payload = validatePayload(req, res);
  if (!payload) return;
  const timestamp = getCurrentTimestamp();

  try {
    const result = await db.prepare(`
      INSERT INTO ${tableName}
        (MailNumber, MailDate, Subject, Department, Section, Notes, UserName, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.MailNumber,
      payload.MailDate,
      payload.Subject,
      payload.Department,
      payload.Section,
      payload.Notes,
      payload.UserName,
      timestamp,
      timestamp
    );
    await logSystem({
      userName: payload.UserName,
      action: 'Add',
      page: 'DepartmentMail',
      details: `Added department mail ID=${result.lastInsertRowid}`
    });
    res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر إضافة بيانات بريد الأقسام.' });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'معرّف السجل غير صالح.' });

  const payload = validatePayload(req, res);
  if (!payload) return;

  try {
    const current = await db.prepare(`SELECT * FROM ${tableName} WHERE ID = ?`).get(id);
    if (!current || !isWithinDataScope(current, req.access)) {
      return res.status(404).json({ message: 'السجل غير موجود للتعديل.' });
    }

    const result = await db.prepare(`
      UPDATE ${tableName}
      SET MailNumber = ?, MailDate = ?, Subject = ?, Department = ?, Section = ?,
          Notes = ?, UserName = ?, UpdatedAt = ?
      WHERE ID = ?
    `).run(
      payload.MailNumber,
      payload.MailDate,
      payload.Subject,
      payload.Department,
      payload.Section,
      payload.Notes,
      payload.UserName,
      getCurrentTimestamp(),
      id
    );
    await logSystem({
      userName: payload.UserName,
      action: 'Update',
      page: 'DepartmentMail',
      details: `Updated department mail ID=${id}`
    });
    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تعديل بيانات بريد الأقسام.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'معرّف السجل غير صالح.' });

  try {
    const current = await db.prepare(`SELECT * FROM ${tableName} WHERE ID = ?`).get(id);
    if (!current || !isWithinDataScope(current, req.access)) {
      return res.status(404).json({ message: 'السجل غير موجود للحذف.' });
    }

    const result = await db.prepare(`DELETE FROM ${tableName} WHERE ID = ?`).run(id);
    await logSystem({
      userName: getUserName(req),
      action: 'Delete',
      page: 'DepartmentMail',
      details: `Deleted department mail ID=${id}`
    });
    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر حذف بيانات بريد الأقسام.' });
  }
});

module.exports = router;
