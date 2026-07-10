const express = require('express');
const { db, logSystem } = require('../database');

const router = express.Router();
const columns = ['EmpID', 'Name', 'Department', 'Section', 'SubSection', 'Status', 'Department1', 'Section1', 'SubSection1', 'Enddate', 'Note', 'UserName'];

function ensureTransferTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS Transfer (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      EmpID INTEGER,
      Name TEXT,
      Department TEXT,
      Section TEXT,
      SubSection TEXT,
      Status TEXT,
      Department1 TEXT,
      Section1 TEXT,
      SubSection1 TEXT,
      Enddate TEXT,
      Note TEXT,
      UserName TEXT
    )
  `).run();

  const columnsInfo = db.prepare('PRAGMA table_info(Transfer)').all();
  if (!columnsInfo.some((column) => String(column.name || '').toLowerCase() === 'username')) {
    db.prepare('ALTER TABLE Transfer ADD COLUMN UserName TEXT').run();
  }
}

ensureTransferTable();
const formNameOptions = [
  'نموذج أمر إداري',
  'نموذج تنقل إداري',
  'نموذج تكليف',
  'نموذج إنذار إداري',
  'نموذج ملاحظة إدارية'
];

function normalize(value) {
  return String(value || '').trim();
}

function formatDateOnly(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

function getArabicDayName(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return days[date.getDay()] || '';
}

function buildInsertStatement(payload) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `INSERT INTO Transfer (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    values: keys.map((key) => payload[key])
  };
}

function buildUpdateStatement(payload, id) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `UPDATE Transfer SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE ID = ?`,
    values: [...keys.map((key) => payload[key]), id]
  };
}

router.get('/forms/options', (req, res) => {
  try {
    res.json({ formNames: formNameOptions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل بيانات النماذج الإدارية.' });
  }
});

router.get('/forms', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT ID, FormDate, DayName, EmployeeName, Department, Section, FormName, Notes, CreatedAt, CreatedBy
      FROM AdministrativeForms
      ORDER BY FormDate DESC, ID DESC
      LIMIT 1000
    `).all();

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل أرشيف النماذج الإدارية.' });
  }
});

router.post('/forms', (req, res) => {
  const formDateInput = normalize(req.body.FormDate);
  const formName = normalize(req.body.FormName);
  const notes = normalize(req.body.Notes);
  const selectedEmpId = normalize(req.body.EmpID);

  if (!formDateInput) {
    return res.status(400).json({ message: 'التاريخ مطلوب.' });
  }

  if (!formName) {
    return res.status(400).json({ message: 'اسم النموذج مطلوب.' });
  }

  if (!selectedEmpId) {
    return res.status(400).json({ message: 'اسم الموظف مطلوب.' });
  }

  const employee = db.prepare(`
    SELECT ID, Name, Department, Section, Status
    FROM Main
    WHERE CAST(ID AS TEXT) = ?
    LIMIT 1
  `).get(selectedEmpId);

  if (!employee) {
    return res.status(404).json({ message: 'الموظف المحدد غير موجود.' });
  }

  if (normalize(employee.Status) !== 'نشط') {
    return res.status(400).json({ message: 'لا يمكن التسجيل لموظف غير نشط.' });
  }

  const normalizedDate = formatDateOnly(formDateInput.replace(/-/g, '/'));
  if (!normalizedDate) {
    return res.status(400).json({ message: 'صيغة التاريخ غير صالحة.' });
  }

  const dayName = getArabicDayName(normalizedDate.replace(/\//g, '-'));
  const createdAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

  try {
    const result = db.prepare(`
      INSERT INTO AdministrativeForms (
        FormDate, DayName, FormName, EmpID, EmployeeName, Department, Section, Notes, CreatedAt, CreatedBy
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalizedDate,
      dayName,
      formName,
      String(employee.ID || ''),
      normalize(employee.Name),
      normalize(employee.Department),
      normalize(employee.Section),
      notes,
      createdAt,
      req.user?.username || 'system'
    );

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Add',
      page: 'Administrative',
      details: `Archived administrative form ID=${result.lastInsertRowid}`
    });

    res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تسجيل النموذج الإداري.' });
  }
});

router.get('/transfers', (req, res) => {
  const records = db.prepare('SELECT * FROM Transfer ORDER BY ID DESC LIMIT 1000').all();
  res.json(records);
});

router.get('/transfers/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'معرّف غير صالح' });

  const record = db.prepare('SELECT * FROM Transfer WHERE ID = ?').get(id);
  return record ? res.json(record) : res.status(404).json({ message: 'السجل غير موجود' });
});

router.post('/transfers', (req, res) => {
  const statement = buildInsertStatement(req.body);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  logSystem({ userName: req.body.userName || 'system', action: 'Add', page: 'Transfer', details: `Added transfer ID=${result.lastInsertRowid}` });
  res.json({ id: result.lastInsertRowid });
});

router.put('/transfers/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'معرّف غير صالح' });

  const statement = buildUpdateStatement(req.body, id);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للتعديل' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Update', page: 'Transfer', details: `Updated transfer ID=${id}` });
  res.json({ changes: result.changes });
});

router.delete('/transfers/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'معرّف غير صالح' });

  const result = db.prepare('DELETE FROM Transfer WHERE ID = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للحذف' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Delete', page: 'Transfer', details: `Deleted transfer ID=${id}` });
  res.json({ changes: result.changes });
});

module.exports = router;

