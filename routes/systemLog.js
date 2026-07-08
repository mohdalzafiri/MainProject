const express = require('express');
const { db } = require('../database');
const router = express.Router();

function normalizeDateInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\//g, '-');
}

function replaceEmployeeIdWithName(record) {
  if (!record || !record.Details) {
    return record;
  }

  const details = String(record.Details);
  const mappings = [
    { pattern: /employee ID=(\d+)/i, table: 'Main', label: 'الموظف' },
    { pattern: /holiday ID=(\d+)/i, table: 'Holiday', label: 'الموظف' },
    { pattern: /course ID=(\d+)/i, table: 'Course', label: 'الموظف' },
    { pattern: /transfer ID=(\d+)/i, table: 'Transfer', label: 'الموظف' },
    { pattern: /daily record ID=(\d+)/i, table: record.Target, label: 'الموظف' }
  ];

  for (const mapping of mappings) {
    const match = details.match(mapping.pattern);
    if (!match) {
      continue;
    }

    const rowId = Number(match[1]);
    if (!rowId) {
      return record;
    }

    try {
      const source = db.prepare(`SELECT Name FROM "${String(mapping.table || '').replace(/"/g, '""')}" WHERE ID = ? LIMIT 1`).get(rowId);
      const name = String(source?.Name || '').trim();
      if (!name) {
        return record;
      }

      return {
        ...record,
        Details: details.replace(mapping.pattern, `${mapping.label}: ${name}`)
      };
    } catch (error) {
      return record;
    }
  }

  return record;
}

router.get('/', (req, res) => {
  const filters = [];
  const params = [];

  if (req.query.userName) {
    filters.push('UserName = ?');
    params.push(req.query.userName);
  }
  if (req.query.action) {
    filters.push('Action = ?');
    params.push(req.query.action);
  }
  if (req.query.target) {
    filters.push('Target = ?');
    params.push(req.query.target);
  }

  const fromDate = normalizeDateInput(req.query.fromDate);
  const toDate = normalizeDateInput(req.query.toDate);

  if (fromDate) {
    filters.push('date(Timestamp) >= date(?)');
    params.push(fromDate);
  }

  if (toDate) {
    filters.push('date(Timestamp) <= date(?)');
    params.push(toDate);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const sql = `SELECT * FROM SystemLog ${whereClause} ORDER BY Timestamp DESC`;
  const records = db.prepare(sql).all(...params).map(replaceEmployeeIdWithName);
  res.json(records);
});

module.exports = router;
