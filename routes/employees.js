const express = require('express');
const { db, logSystem } = require('../database');

const router = express.Router();
const columns = ['Title', 'Name', 'CivilID', 'Department', 'Section', 'Status', 'Rank', 'Empdate', 'Startdate', 'Enddate', 'Work', 'Note'];

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

router.get('/', (req, res) => {
  const records = db.prepare('SELECT * FROM Main ORDER BY ID DESC LIMIT 1000').all();
  res.json(records);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف الموظف غير صالح' });
  }

  const record = db.prepare('SELECT * FROM Main WHERE ID = ?').get(id);
  return record ? res.json(record) : res.status(404).json({ message: 'الموظف غير موجود' });
});

router.post('/', (req, res) => {
  const statement = buildInsertStatement(req.body);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  logSystem({ userName: req.body.userName || 'system', action: 'Add', page: 'Main', details: `Added employee ID=${result.lastInsertRowid}` });
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف الموظف غير صالح' });
  }

  const statement = buildUpdateStatement(req.body, id);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'الموظف غير موجود للتعديل' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Update', page: 'Main', details: `Updated employee ID=${id}` });
  res.json({ changes: result.changes });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف الموظف غير صالح' });
  }

  const result = db.prepare('DELETE FROM Main WHERE ID = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'الموظف غير موجود للحذف' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Delete', page: 'Main', details: `Deleted employee ID=${id}` });
  res.json({ changes: result.changes });
});

module.exports = router;

