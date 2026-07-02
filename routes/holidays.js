const express = require('express');
const { db, logSystem } = require('../database');

const router = express.Router();
const columns = ['EmpID', 'Name', 'Department', 'Section', 'Status', 'Type', 'Startdate', 'Enddate', 'Days', 'Note'];

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

