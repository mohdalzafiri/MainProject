const express = require('express');
const { db } = require('../database');

const router = express.Router();

router.get('/daily-all', async (req, res) => {
  const records = (await db.prepare('SELECT * FROM DailyAll ORDER BY Today DESC LIMIT 1000').all());
  res.json(records);
});

router.get('/daily-all-p', async (req, res) => {
  const records = (await db.prepare('SELECT * FROM DailyAll_P ORDER BY Today DESC LIMIT 1000').all());
  res.json(records);
});

router.get('/periods', async (req, res) => {
  const records = (await db.prepare('SELECT * FROM Periods_Lookup ORDER BY Period').all());
  res.json(records);
});

router.get('/records', async (req, res) => {
  const filters = [];
  const params = [];
  if (req.query.empId) {
    filters.push('EmpID = ?');
    params.push(req.query.empId);
  }
  if (req.query.status) {
    filters.push('Status = ?');
    params.push(req.query.status);
  }
  if (req.query.period) {
    filters.push('Period = ?');
    params.push(req.query.period);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const sql = `SELECT * FROM DailyAll ${whereClause} ORDER BY Today DESC LIMIT 1000`;
  const records = (await db.prepare(sql).all(...params));
  res.json(records);
});

module.exports = router;
