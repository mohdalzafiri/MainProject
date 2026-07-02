const express = require('express');
const { db } = require('../database');

const router = express.Router();

function tableOrViewExists(name) {
  const row = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE name = ? AND type IN ('table','view') LIMIT 1").get(name);
  return Boolean(row);
}

router.get('/summary', (req, res) => {
  try {
    const totals = {
      totalEmployees: tableOrViewExists('Main') ? db.prepare('SELECT COUNT(*) AS count FROM Main').get().count : 0,
      totalDailyRecords: tableOrViewExists('DailyAll') ? db.prepare('SELECT COUNT(*) AS count FROM DailyAll').get().count : 0,
      totalHolidays: tableOrViewExists('Holiday') ? db.prepare('SELECT COUNT(*) AS count FROM Holiday').get().count : 0,
      totalTransfers: tableOrViewExists('Transfer') ? db.prepare('SELECT COUNT(*) AS count FROM Transfer').get().count : 0,
      totalUsers: tableOrViewExists('Login') ? db.prepare('SELECT COUNT(*) AS count FROM Login').get().count : 0,
      totalSystemEvents: tableOrViewExists('SystemLog') ? db.prepare('SELECT COUNT(*) AS count FROM SystemLog').get().count : 0,
      totalMonthlyRecords: tableOrViewExists('DailyAll')
        ? db.prepare("SELECT COUNT(*) AS count FROM DailyAll WHERE strftime('%Y-%m', Today) = strftime('%Y-%m', 'now')").get().count
        : 0
    };

    const departments = tableOrViewExists('DailyAll_P')
      ? db.prepare(`
          SELECT Department AS label, COUNT(DISTINCT EmpID) AS value
          FROM DailyAll_P
          WHERE Department IS NOT NULL AND TRIM(Department) <> ''
          GROUP BY Department
          ORDER BY value DESC
          LIMIT 8
        `).all()
      : [];

    const shifts = tableOrViewExists('DailyAll_P')
      ? db.prepare(`
          SELECT Period AS label, COUNT(DISTINCT EmpID) AS value
          FROM DailyAll_P
          WHERE Period IS NOT NULL AND TRIM(Period) <> ''
          GROUP BY Period
          ORDER BY value DESC
          LIMIT 8
        `).all()
      : [];

    const sections = tableOrViewExists('DailyAll_P')
      ? db.prepare(`
          SELECT Section AS label, COUNT(DISTINCT EmpID) AS value
          FROM DailyAll_P
          WHERE Section IS NOT NULL AND TRIM(Section) <> ''
          GROUP BY Section
          ORDER BY value DESC
          LIMIT 8
        `).all()
      : [];

    const todaySummary = tableOrViewExists('EmpSummary_Today')
      ? db.prepare('SELECT * FROM EmpSummary_Today ORDER BY WorkDays DESC LIMIT 8').all()
      : [];

    const monthSummary = tableOrViewExists('EmpSummary_ThisMonth')
      ? db.prepare('SELECT * FROM EmpSummary_ThisMonth ORDER BY PresentDays DESC LIMIT 8').all()
      : [];

    res.json({
      totals,
      departments,
      shifts,
      sections,
      todaySummary,
      monthSummary
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل ملخص الرئيسية' });
  }
});

module.exports = router;
