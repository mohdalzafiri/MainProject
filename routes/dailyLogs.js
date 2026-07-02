const express = require('express');
const { db, dailyTables, isValidDailyTable, logSystem } = require('../database');

const router = express.Router();
const columns = ['EmpID', 'Day', 'Today', 'Name', 'Department', 'Section', 'Status', 'Period', 'InTime', 'OutTime', 'Startdate', 'Enddate', 'Type', 'Note'];

function buildInsertStatement(table, payload) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    values: keys.map((key) => payload[key])
  };
}

function buildUpdateStatement(table, payload, id) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `UPDATE ${table} SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE ID = ?`,
    values: [...keys.map((key) => payload[key]), id]
  };
}

router.get('/', (req, res) => {
  const records = db.prepare('SELECT * FROM DailyAll ORDER BY Today DESC LIMIT 1000').all();
  res.json(records);
});

router.get('/tables', (req, res) => {
  res.json(dailyTables);
});

router.get('/table/:table', (req, res) => {
  const table = req.params.table;
  if (!isValidDailyTable(table)) {
    return res.status(400).json({ message: 'اسم جدول غير صالح' });
  }

  const records = db.prepare(`SELECT * FROM ${table} ORDER BY Today DESC`).all();
  res.json(records);
});

router.get('/table/:table/:id', (req, res) => {
  const table = req.params.table;
  const id = Number(req.params.id);
  if (!isValidDailyTable(table) || !id) {
    return res.status(400).json({ message: 'معرّف غير صالح أو جدول غير صالح' });
  }

  const record = db.prepare(`SELECT * FROM ${table} WHERE ID = ?`).get(id);
  return record ? res.json(record) : res.status(404).json({ message: 'السجل غير موجود' });
});

router.get('/search', (req, res) => {
  const filters = [];
  const params = [];
  const columnsMap = {
    empId: 'EmpID',
    status: 'Status',
    department: 'Department',
    today: 'Today'
  };

  Object.entries(columnsMap).forEach(([param, column]) => {
    if (req.query[param]) {
      filters.push(`${column} = ?`);
      params.push(req.query[param]);
    }
  });

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const sql = `SELECT * FROM DailyAll ${whereClause} ORDER BY Today DESC LIMIT 1000`;
  const records = db.prepare(sql).all(...params);
  res.json(records);
});

router.post('/table/:table', (req, res) => {
  const table = req.params.table;
  if (!isValidDailyTable(table)) {
    return res.status(400).json({ message: 'اسم جدول غير صالح' });
  }

  const statement = buildInsertStatement(table, req.body);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كاملة' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  logSystem({ userName: req.body.userName || 'system', action: 'Add', page: table, details: `Added daily record ID=${result.lastInsertRowid}` });
  res.json({ id: result.lastInsertRowid });
});

router.put('/table/:table/:id', (req, res) => {
  const table = req.params.table;
  const id = Number(req.params.id);
  if (!isValidDailyTable(table) || !id) {
    return res.status(400).json({ message: 'معرّف غير صالح أو جدول غير صالح' });
  }

  const statement = buildUpdateStatement(table, req.body, id);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كاملة' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للتعديل' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Update', page: table, details: `Updated daily record ID=${id}` });
  res.json({ changes: result.changes });
});

router.delete('/table/:table/:id', (req, res) => {
  const table = req.params.table;
  const id = Number(req.params.id);
  if (!isValidDailyTable(table) || !id) {
    return res.status(400).json({ message: 'معرّف غير صالح أو جدول غير صالح' });
  }

  const result = db.prepare(`DELETE FROM ${table} WHERE ID = ?`).run(id);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للحذف' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Delete', page: table, details: `Deleted daily record ID=${id}` });
  res.json({ changes: result.changes });
});

module.exports = router;

