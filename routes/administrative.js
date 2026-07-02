const express = require('express');
const { db, logSystem } = require('../database');

const router = express.Router();
const columns = ['EmpID', 'Name', 'Department', 'Section', 'Status', 'Department1', 'Section1', 'Enddate', 'Note'];

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

