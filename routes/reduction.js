const express = require('express');
const { db, logSystem, registerDatabaseInitializer } = require('../database');

const router = express.Router();
const columns = ['EmpID', 'Name', 'Department', 'Section', 'Status', 'Type', 'Startdate', 'Enddate', 'Hours', 'Note', 'UserName'];

async function ensureReductionTable() {
  (await db.prepare(`
    CREATE TABLE IF NOT EXISTS Reduction (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      EmpID INTEGER,
      Name TEXT,
      Department TEXT,
      Section TEXT,
      Status TEXT,
      Type TEXT,
      Startdate TEXT,
      Enddate TEXT,
      Hours INTEGER DEFAULT 2,
      Note TEXT,
      UserName TEXT
    )
  `).run());
}

async function ensureColumn(tableName, columnName, columnType, defaultValue = null) {
  const columnsInfo = (await db.prepare(`PRAGMA table_info(${tableName})`).all());
  const hasColumn = columnsInfo.some((column) => String(column.name || '').toLowerCase() === String(columnName || '').toLowerCase());
  if (hasColumn) return;

  const defaultClause = defaultValue === null ? '' : ` DEFAULT ${defaultValue}`;
  (await db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}${defaultClause}`).run());
}

registerDatabaseInitializer(async () => {
  await ensureReductionTable();
  await ensureColumn('Reduction', 'UserName', 'TEXT');
  await ensureColumn('Reduction', 'Hours', 'INTEGER', '2');
});

function normalizeText(value) {
  return String(value || '').trim();
}

function isValidStatus(value) {
  const status = normalizeText(value);
  return status === 'تخفيف عمل' || status === 'تأخير' || status === 'مبكر';
}

function isValidType(value) {
  const type = normalizeText(value);
  return type === 'بداية الدوام' || type === 'نهاية الدوام';
}

function buildInsertStatement(payload) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;

  return {
    sql: `INSERT INTO Reduction (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    values: keys.map((key) => payload[key])
  };
}

function buildUpdateStatement(payload, id) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;

  return {
    sql: `UPDATE Reduction SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE ID = ?`,
    values: [...keys.map((key) => payload[key]), id]
  };
}

router.get('/', async (req, res) => {
  const records = (await db.prepare('SELECT * FROM Reduction ORDER BY Startdate DESC, ID DESC').all());
  res.json(records);
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف غير صالح' });
  }

  const record = (await db.prepare('SELECT * FROM Reduction WHERE ID = ?').get(id));
  return record ? res.json(record) : res.status(404).json({ message: 'السجل غير موجود' });
});

router.post('/', async (req, res) => {
  const payload = { ...req.body };
  const status = normalizeText(payload.Status);
  const type = normalizeText(payload.Type);
  const startDate = normalizeText(payload.Startdate);
  const empId = Number(payload.EmpID || 0);
  const employeeName = normalizeText(payload.Name);

  if (!status || !isValidStatus(status)) {
    return res.status(400).json({ message: 'الحالة يجب أن تكون تخفيف عمل.' });
  }

  if (!type || !isValidType(type)) {
    return res.status(400).json({ message: 'يجب اختيار بداية الدوام أو نهاية الدوام.' });
  }

  if (!startDate) {
    return res.status(400).json({ message: 'تاريخ البداية إلزامي.' });
  }

  if (!empId && !employeeName) {
    return res.status(400).json({ message: 'يجب اختيار اسم الموظف.' });
  }

  payload.Status = status;
  payload.Type = type;
  payload.Hours = Number(payload.Hours || 2);
  payload.Startdate = startDate;
  payload.Enddate = normalizeText(payload.Enddate);

  const statement = buildInsertStatement(payload);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = (await db.prepare(statement.sql).run(statement.values));
  (await logSystem({ userName: payload.UserName || 'system', action: 'Add', page: 'Reduction', details: `Added work reduction ID=${result.lastInsertRowid}` }));
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف غير صالح' });
  }

  const payload = { ...req.body };
  const status = normalizeText(payload.Status);
  const type = normalizeText(payload.Type);
  const startDate = normalizeText(payload.Startdate);
  const empId = Number(payload.EmpID || 0);
  const employeeName = normalizeText(payload.Name);

  if (status && !isValidStatus(status)) {
    return res.status(400).json({ message: 'قيمة الحالة غير مسموحة.' });
  }

  if (type && !isValidType(type)) {
    return res.status(400).json({ message: 'قيمة نوع التخفيف غير مسموحة.' });
  }

  if (startDate) {
    payload.Startdate = startDate;
  }

  if (payload.Enddate !== undefined) {
    payload.Enddate = normalizeText(payload.Enddate);
  }

  if (payload.Hours !== undefined) {
    payload.Hours = Number(payload.Hours || 2);
  }

  if (!empId && !employeeName && !payload.EmpID && !payload.Name) {
    const current = (await db.prepare('SELECT EmpID, Name FROM Reduction WHERE ID = ?').get(id));
    if (current) {
      payload.EmpID = current.EmpID;
      payload.Name = current.Name;
    }
  }

  if (!payload.Startdate) {
    return res.status(400).json({ message: 'تاريخ البداية إلزامي.' });
  }

  const statement = buildUpdateStatement(payload, id);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = (await db.prepare(statement.sql).run(statement.values));
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للتعديل' });
  }

  (await logSystem({ userName: payload.UserName || 'system', action: 'Update', page: 'Reduction', details: `Updated work reduction ID=${id}` }));
  res.json({ changes: result.changes });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف غير صالح' });
  }

  const result = (await db.prepare('DELETE FROM Reduction WHERE ID = ?').run(id));
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للحذف' });
  }

  (await logSystem({ userName: req.body.userName || 'system', action: 'Delete', page: 'Reduction', details: `Deleted work reduction ID=${id}` }));
  res.json({ changes: result.changes });
});

module.exports = router;
