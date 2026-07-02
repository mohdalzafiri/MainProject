const express = require('express');
const { db } = require('../database');

const router = express.Router();
const validSummaries = new Set(['today', 'week', 'month', 'quarter', 'halfyear', 'year']);

router.get('/daily-base', (req, res) => {
  const records = db.prepare('SELECT * FROM EmpEval_DailyBase ORDER BY Today DESC LIMIT 1000').all();
  res.json(records);
});

router.get('/daily-base-p', (req, res) => {
  const records = db.prepare('SELECT * FROM EmpEval_DailyBase_P ORDER BY Today DESC LIMIT 1000').all();
  res.json(records);
});

router.get('/summary/:period', (req, res) => {
  const period = String(req.params.period || '').toLowerCase();
  if (!validSummaries.has(period)) {
    return res.status(400).json({ message: 'الفترة غير مدعومة' });
  }

  const viewName = {
    today: 'EmpSummary_Today',
    week: 'EmpSummary_ThisWeek',
    month: 'EmpSummary_ThisMonth',
    quarter: 'EmpSummary_ThisQuarter',
    halfyear: 'EmpSummary_ThisHalfYear',
    year: 'EmpSummary_ThisYear'
  }[period];

  const records = db.prepare(`SELECT * FROM ${viewName} ORDER BY Name LIMIT 1000`).all();
  res.json(records);
});

module.exports = router;
