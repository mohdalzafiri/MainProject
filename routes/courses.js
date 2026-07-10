const express = require('express');
const { db, logSystem } = require('../database');

const router = express.Router();
const columns = ['EmpID', 'Name', 'Department', 'Section', 'Status', 'CourseName', 'CourseProvider', 'Startdate', 'Enddate', 'Days', 'Note', 'UserName'];

function ensureCourseTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS Course (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      EmpID INTEGER,
      Name TEXT,
      Department TEXT,
      Section TEXT,
      Status TEXT,
      CourseName TEXT,
      CourseProvider TEXT,
      Startdate TEXT,
      Enddate TEXT,
      Days INTEGER,
      Note TEXT,
      UserName TEXT
    )
  `).run();

  const columnsInfo = db.prepare('PRAGMA table_info(Course)').all();
  if (!columnsInfo.some((column) => String(column.name || '').toLowerCase() === 'username')) {
    db.prepare('ALTER TABLE Course ADD COLUMN UserName TEXT').run();
  }
}

function normalizeText(value) {
  return String(value || '').trim();
}

function findDuplicateCourse(payload, excludeId = null) {
  const empId = Number(payload.EmpID || 0);
  const name = normalizeText(payload.Name);
  const courseName = normalizeText(payload.CourseName);
  const courseProvider = normalizeText(payload.CourseProvider);
  const startdate = normalizeText(payload.Startdate);
  const enddate = normalizeText(payload.Enddate);

  if (!courseName || !courseProvider || !startdate || !enddate || (!empId && !name)) {
    return null;
  }

  if (empId) {
    const sql = excludeId
      ? 'SELECT ID FROM Course WHERE EmpID = ? AND CourseName = ? AND CourseProvider = ? AND Startdate = ? AND Enddate = ? AND ID <> ? LIMIT 1'
      : 'SELECT ID FROM Course WHERE EmpID = ? AND CourseName = ? AND CourseProvider = ? AND Startdate = ? AND Enddate = ? LIMIT 1';
    const args = excludeId
      ? [empId, courseName, courseProvider, startdate, enddate, excludeId]
      : [empId, courseName, courseProvider, startdate, enddate];
    return db.prepare(sql).get(...args);
  }

  const sql = excludeId
    ? 'SELECT ID FROM Course WHERE Name = ? AND CourseName = ? AND CourseProvider = ? AND Startdate = ? AND Enddate = ? AND ID <> ? LIMIT 1'
    : 'SELECT ID FROM Course WHERE Name = ? AND CourseName = ? AND CourseProvider = ? AND Startdate = ? AND Enddate = ? LIMIT 1';
  const args = excludeId
    ? [name, courseName, courseProvider, startdate, enddate, excludeId]
    : [name, courseName, courseProvider, startdate, enddate];
  return db.prepare(sql).get(...args);
}

function buildInsertStatement(payload) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `INSERT INTO Course (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    values: keys.map((key) => payload[key])
  };
}

function buildUpdateStatement(payload, id) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `UPDATE Course SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE ID = ?`,
    values: [...keys.map((key) => payload[key]), id]
  };
}

ensureCourseTable();

router.get('/', (req, res) => {
  const records = db.prepare('SELECT * FROM Course ORDER BY Startdate DESC, ID DESC').all();
  res.json(records);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف غير صالح' });
  }

  const record = db.prepare('SELECT * FROM Course WHERE ID = ?').get(id);
  return record ? res.json(record) : res.status(404).json({ message: 'السجل غير موجود' });
});

router.post('/', (req, res) => {
  const duplicate = findDuplicateCourse(req.body);
  if (duplicate) {
    return res.status(409).json({ message: 'لا يمكن إدخال نفس الدورة مرتين لنفس الموظف.' });
  }

  const statement = buildInsertStatement(req.body);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  logSystem({ userName: req.body.userName || 'system', action: 'Add', page: 'Course', details: `Added course ID=${result.lastInsertRowid}` });
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف غير صالح' });
  }

  const duplicate = findDuplicateCourse(req.body, id);
  if (duplicate) {
    return res.status(409).json({ message: 'لا يمكن تكرار نفس الدورة لنفس الموظف.' });
  }

  const statement = buildUpdateStatement(req.body, id);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للتعديل' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Update', page: 'Course', details: `Updated course ID=${id}` });
  res.json({ changes: result.changes });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف غير صالح' });
  }

  const result = db.prepare('DELETE FROM Course WHERE ID = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للحذف' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Delete', page: 'Course', details: `Deleted course ID=${id}` });
  res.json({ changes: result.changes });
});

module.exports = router;
