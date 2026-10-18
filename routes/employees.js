const express = require('express');
const { db, logSystem } = require('../database');
const { filterByDataScope, isWithinDataScope } = require('../auth/dataScope');
const { listJobTitles } = require('../services/jobTitleService');

const router = express.Router();
const columns = ['Title', 'Name', 'CivilID', 'Department', 'Section', 'SubSection', 'Status', 'Rank', 'Empdate', 'Startdate', 'Enddate', 'Work', 'Note', 'MilitaryNumber', 'FileNumber'];
const optionalNumberColumns = ['MilitaryNumber', 'FileNumber'];
let ensureColumnsPromise = null;

async function ensureOptionalNumberColumns() {
  const existing = (await db.prepare('PRAGMA table_info(Main)').all())
    .map((column) => String(column.name || '').toLowerCase());
  for (const column of optionalNumberColumns) {
    if (!existing.includes(column.toLowerCase())) {
      await db.prepare(`ALTER TABLE Main ADD COLUMN ${column} TEXT`).run();
    }
  }
}

router.use((req, res, next) => {
  if (!ensureColumnsPromise) {
    ensureColumnsPromise = ensureOptionalNumberColumns().catch((error) => {
      ensureColumnsPromise = null;
      throw error;
    });
  }
  ensureColumnsPromise.then(() => next(), (error) => {
    console.error(error);
    res.status(500).json({ message: 'تعذر تجهيز حقول الرقم العسكري ورقم الملف في قاعدة البيانات.' });
  });
});

function normalizeOptionalNumbers(payload) {
  optionalNumberColumns.forEach((column) => {
    if (Object.prototype.hasOwnProperty.call(payload, column)) {
      payload[column] = String(payload[column] == null ? '' : payload[column]).replace(/\D/g, '');
    }
  });
  return payload;
}

function isActiveStatus(status) {
  return String(status || '').trim() === 'نشط';
}

function buildInsertStatement(payload) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `INSERT INTO Main (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    values: keys.map((key) => payload[key])
  };
}

function buildUpdateStatement(payload, id) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `UPDATE Main SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE ID = ?`,
    values: [...keys.map((key) => payload[key]), id]
  };
}

router.get('/', async (req, res) => {
  try {
    const records = (await db.prepare('SELECT * FROM Main ORDER BY ID DESC').all());
    res.json(filterByDataScope(records, req.access));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر قراءة بيانات الموظفين من قاعدة البيانات' });
  }
});

router.get('/department-sections', async (req, res) => {
  try {
    const rows = (await db.prepare(`
      SELECT ID, Department, Section, SubSection, SortOrder
      FROM DepartmentSectionLookup
      WHERE IsActive = 1
      ORDER BY SortOrder ASC, ID ASC
    `).all());

    res.json(filterByDataScope(rows, req.access));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل الأقسام والنوبات.' });
  }
});

router.get('/job-titles', async (req, res) => {
  try {
    res.json(await listJobTitles(db));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل المسميات الوظيفية.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف الموظف غير صالح' });
  }

  try {
    const record = (await db.prepare('SELECT * FROM Main WHERE ID = ?').get(id));
    return record && isWithinDataScope(record, req.access)
      ? res.json(record)
      : res.status(404).json({ message: 'الموظف غير موجود' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر قراءة بيانات الموظف' });
  }
});

router.post('/', async (req, res) => {
  const civilId = String(req.body.CivilID || '').trim();
  if (!isWithinDataScope(req.body, req.access)) {
    return res.status(403).json({ message: 'لا تملك صلاحية إضافة موظف خارج نطاق القسم أو النوبة المسموحة.' });
  }

  const statement = buildInsertStatement(normalizeOptionalNumbers(req.body));
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  if (civilId) {
    const existingEmployee = (await db.prepare(`
      SELECT ID, Name
      FROM Main
      WHERE TRIM(CivilID) = ?
      LIMIT 1
    `).get(civilId));

    if (existingEmployee) {
      return res.status(409).json({
        message: `الرقم المدني مسجل مسبقاً باسم ${String(existingEmployee.Name || '').trim() || 'موظف آخر'}.`
      });
    }
  }

  try {
    const result = (await db.prepare(statement.sql).run(statement.values));
    (await logSystem({ userName: req.body.userName || 'system', action: 'Add', page: 'Main', details: `Added employee ID=${result.lastInsertRowid}` }));
    res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر إضافة بيانات الموظف. تحقق من صلاحية الكتابة على قاعدة البيانات.' });
  }
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف الموظف غير صالح' });
  }

  const statement = buildUpdateStatement(normalizeOptionalNumbers(req.body), id);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  try {
    const currentRecord = (await db.prepare('SELECT * FROM Main WHERE ID = ?').get(id));
    if (!currentRecord || !isWithinDataScope(currentRecord, req.access)) {
      return res.status(404).json({ message: 'الموظف غير موجود للتعديل' });
    }
    if (!isWithinDataScope({ ...currentRecord, ...req.body }, req.access)) {
      return res.status(403).json({ message: 'لا تملك صلاحية نقل الموظف خارج نطاق القسم أو النوبة المسموحة.' });
    }

    const result = (await db.prepare(statement.sql).run(statement.values));
    if (result.changes === 0) {
      return res.status(404).json({ message: 'الموظف غير موجود للتعديل' });
    }

    const updatedRecord = (await db.prepare('SELECT ID, Status FROM Main WHERE ID = ?').get(id));
    const movedToOutside = updatedRecord ? !isActiveStatus(updatedRecord.Status) : false;
    const movedToActive = updatedRecord ? isActiveStatus(updatedRecord.Status) : false;

    (await logSystem({ userName: req.body.userName || 'system', action: 'Update', page: 'Main', details: `Updated employee ID=${id}` }));
    res.json({ changes: result.changes, movedToOutside, movedToActive, status: (updatedRecord && updatedRecord.Status) || '' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تعديل بيانات الموظف. تحقق من صلاحية الكتابة على قاعدة البيانات.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف الموظف غير صالح' });
  }

  try {
    const currentRecord = (await db.prepare('SELECT * FROM Main WHERE ID = ?').get(id));
    if (!currentRecord || !isWithinDataScope(currentRecord, req.access)) {
      return res.status(404).json({ message: 'الموظف غير موجود للحذف' });
    }

    const result = (await db.prepare('DELETE FROM Main WHERE ID = ?').run(id));
    if (result.changes === 0) {
      return res.status(404).json({ message: 'الموظف غير موجود للحذف' });
    }

    (await logSystem({ userName: req.body.userName || 'system', action: 'Delete', page: 'Main', details: `Deleted employee ID=${id}` }));
    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر حذف بيانات الموظف. تحقق من صلاحية الكتابة على قاعدة البيانات.' });
  }
});

module.exports = router;
