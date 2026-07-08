const express = require('express');
const { db, dailyTables, isValidDailyTable, logSystem } = require('../database');

const router = express.Router();
const columns = ['EmpID', 'Day', 'Today', 'Name', 'Department', 'Section', 'SubSection', 'Status', 'Period', 'InTime', 'OutTime', 'Startdate', 'Enddate', 'Type', 'Note'];

function normalizeDateInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\//g, '-');
}

function getDistinctValues(column) {
  return db.prepare(`
    SELECT DISTINCT TRIM(${column}) AS value
    FROM DailyAll
    WHERE ${column} IS NOT NULL AND TRIM(${column}) <> ''
    ORDER BY value ASC
  `).all().map((row) => row.value);
}

function getLookupDepartments() {
  return db.prepare(`
    SELECT DISTINCT TRIM(Department) AS value
    FROM DepartmentSectionLookup
    WHERE IsActive = 1 AND TRIM(Department) <> ''
    ORDER BY ID ASC
  `).all().map((row) => row.value);
}

function getLookupSections() {
  return db.prepare(`
    SELECT DISTINCT TRIM(Section) AS value
    FROM DepartmentSectionLookup
    WHERE IsActive = 1 AND TRIM(Section) <> ''
    ORDER BY ID ASC
  `).all().map((row) => row.value);
}

function getLookupSubSections() {
  return db.prepare(`
    SELECT DISTINCT TRIM(SubSection) AS value
    FROM DepartmentSectionLookup
    WHERE IsActive = 1 AND TRIM(SubSection) <> ''
    ORDER BY ID ASC
  `).all().map((row) => row.value);
}

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

router.get('/filters', (req, res) => {
  try {
    res.json({
      departments: getLookupDepartments(),
      sections: getLookupSections(),
      subSections: getLookupSubSections(),
      departmentSections: db.prepare(`
        SELECT Department, Section, SubSection, SortOrder
        FROM DepartmentSectionLookup
        WHERE IsActive = 1
        ORDER BY ID ASC
      `).all(),
      periods: getDistinctValues('Period'),
      statuses: getDistinctValues('Status')
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل فلاتر اليوميات' });
  }
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
    name: 'Name',
    status: 'Status',
    department: 'Department',
    section: 'Section',
    subSection: 'SubSection',
    period: 'Period',
    day: 'Day',
    today: 'Today'
  };

  Object.entries(columnsMap).forEach(([param, column]) => {
    if (req.query[param]) {
      if (param === 'name') {
        filters.push(`${column} LIKE ?`);
        params.push(`%${String(req.query[param]).trim()}%`);
      } else {
        filters.push(`${column} = ?`);
        params.push(req.query[param]);
      }
    }
  });

  const fromDate = normalizeDateInput(req.query.fromDate);
  const toDate = normalizeDateInput(req.query.toDate);

  if (fromDate) {
    filters.push(`date(REPLACE(Today, '/', '-')) >= date(?)`);
    params.push(fromDate);
  }

  if (toDate) {
    filters.push(`date(REPLACE(Today, '/', '-')) <= date(?)`);
    params.push(toDate);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const sql = `
    SELECT *
    FROM DailyAll
    ${whereClause}
    ORDER BY date(REPLACE(Today, '/', '-')) DESC, Name ASC, ID DESC
    LIMIT 5000
  `;
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

