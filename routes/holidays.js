const express = require('express');
const { db, logSystem } = require('../database');

const router = express.Router();
const columns = ['EmpID', 'Name', 'Department', 'Section', 'Status', 'Type', 'Startdate', 'Enddate', 'Days', 'Note', 'UserName'];

function ensureHolidayTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS Holiday (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      EmpID INTEGER,
      Name TEXT,
      Department TEXT,
      Section TEXT,
      Status TEXT,
      Type TEXT,
      Startdate TEXT,
      Enddate TEXT,
      Days INTEGER,
      Note TEXT,
      UserName TEXT
    )
  `).run();
}

function ensureColumn(tableName, columnName, columnType) {
  const columnsInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const hasColumn = columnsInfo.some((column) => String(column.name || '').toLowerCase() === String(columnName || '').toLowerCase());
  if (hasColumn) return;
  db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`).run();
}

ensureHolidayTable();
ensureColumn('Holiday', 'UserName', 'TEXT');

function normalizeText(value) {
  return String(value || '').trim();
}

function findDuplicateHoliday(payload, excludeId = null) {
  const empId = Number(payload.EmpID || 0);
  const name = normalizeText(payload.Name);
  const type = normalizeText(payload.Type);
  const startdate = normalizeText(payload.Startdate);
  const enddate = normalizeText(payload.Enddate);

  if (!type || !startdate || !enddate || (!empId && !name)) {
    return null;
  }

  if (empId) {
    const sql = excludeId
      ? 'SELECT ID FROM Holiday WHERE EmpID = ? AND Type = ? AND Startdate = ? AND Enddate = ? AND ID <> ? LIMIT 1'
      : 'SELECT ID FROM Holiday WHERE EmpID = ? AND Type = ? AND Startdate = ? AND Enddate = ? LIMIT 1';
    const args = excludeId ? [empId, type, startdate, enddate, excludeId] : [empId, type, startdate, enddate];
    return db.prepare(sql).get(...args);
  }

  const sql = excludeId
    ? 'SELECT ID FROM Holiday WHERE Name = ? AND Type = ? AND Startdate = ? AND Enddate = ? AND ID <> ? LIMIT 1'
    : 'SELECT ID FROM Holiday WHERE Name = ? AND Type = ? AND Startdate = ? AND Enddate = ? LIMIT 1';
  const args = excludeId ? [name, type, startdate, enddate, excludeId] : [name, type, startdate, enddate];
  return db.prepare(sql).get(...args);
}

function buildInsertStatement(payload) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `INSERT INTO Holiday (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    values: keys.map((key) => payload[key])
  };
}

function buildUpdateStatement(payload, id) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `UPDATE Holiday SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE ID = ?`,
    values: [...keys.map((key) => payload[key]), id]
  };
}

router.get('/', (req, res) => {
  const records = db.prepare('SELECT * FROM Holiday ORDER BY Startdate DESC').all();
  res.json(records);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف غير صالح' });
  }

  const record = db.prepare('SELECT * FROM Holiday WHERE ID = ?').get(id);
  return record ? res.json(record) : res.status(404).json({ message: 'السجل غير موجود' });
});

router.post('/', (req, res) => {
  const duplicate = findDuplicateHoliday(req.body);
  if (duplicate) {
    return res.status(409).json({ message: 'لا يمكن إدخال نفس الإجازة مرتين لنفس الموظف.' });
  }

  const statement = buildInsertStatement(req.body);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  logSystem({ userName: req.body.userName || 'system', action: 'Add', page: 'Holiday', details: `Added holiday ID=${result.lastInsertRowid}` });
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف غير صالح' });
  }

  const duplicate = findDuplicateHoliday(req.body, id);
  if (duplicate) {
    return res.status(409).json({ message: 'لا يمكن تكرار نفس الإجازة لنفس الموظف.' });
  }

  const statement = buildUpdateStatement(req.body, id);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للتعديل' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Update', page: 'Holiday', details: `Updated holiday ID=${id}` });
  res.json({ changes: result.changes });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف غير صالح' });
  }

  const result = db.prepare('DELETE FROM Holiday WHERE ID = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للحذف' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Delete', page: 'Holiday', details: `Deleted holiday ID=${id}` });
  res.json({ changes: result.changes });
});

module.exports = router;

