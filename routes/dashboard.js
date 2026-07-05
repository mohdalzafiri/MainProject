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
      totalCourses: tableOrViewExists('Course') ? db.prepare('SELECT COUNT(*) AS count FROM Course').get().count : 0,
      totalTransfers: tableOrViewExists('Transfer') ? db.prepare('SELECT COUNT(*) AS count FROM Transfer').get().count : 0,
      totalUsers: tableOrViewExists('Login') ? db.prepare('SELECT COUNT(*) AS count FROM Login').get().count : 0,
      totalSystemEvents: tableOrViewExists('SystemLog') ? db.prepare('SELECT COUNT(*) AS count FROM SystemLog').get().count : 0,
      totalMonthlyRecords: tableOrViewExists('DailyAll')
        ? db.prepare("SELECT COUNT(*) AS count FROM DailyAll WHERE strftime('%Y-%m', Today) = strftime('%Y-%m', 'now')").get().count
        : 0
    };

    const departments = tableOrViewExists('DailyAll_P')
      ? db.prepare(`
          SELECT
            CASE
              WHEN TRIM(Department) = 'الإحصاء' THEN 'الاحصاء'
              ELSE TRIM(Department)
            END AS label,
            COUNT(DISTINCT EmpID) AS value
          FROM DailyAll_P
          WHERE Department IS NOT NULL AND TRIM(Department) <> ''
          GROUP BY CASE
            WHEN TRIM(Department) = 'الإحصاء' THEN 'الاحصاء'
            ELSE TRIM(Department)
          END
          ORDER BY value DESC
          LIMIT 8
        `).all()
      : [];

    const shifts = tableOrViewExists('DailyAll_P')
      ? db.prepare(`
          WITH shift_labels(label, sort_order) AS (
            VALUES
              ('أ - البلاغات', 1),
              ('ب - البلاغات', 2),
              ('ج - البلاغات', 3),
              ('د - البلاغات', 4),
              ('هـ - البلاغات', 5),
              ('ثابت صبح', 6),
              ('أ - العمليات', 7),
              ('ب - العمليات', 8),
              ('ج - العمليات', 9),
              ('د - العمليات', 10),
              ('هـ - العمليات', 11)
          ),
          source AS (
            SELECT DISTINCT EmpID, TRIM(Section) AS section_label
            FROM DailyAll_P
            WHERE Section IS NOT NULL AND TRIM(Section) <> ''
          )
          SELECT
            shift_labels.label AS label,
            COUNT(source.EmpID) AS value
          FROM shift_labels
          LEFT JOIN source ON source.section_label = shift_labels.label
          GROUP BY shift_labels.label, shift_labels.sort_order
          ORDER BY shift_labels.sort_order
        `).all()
      : [];

    const sections = tableOrViewExists('DailyAll_P')
      ? db.prepare(`
          WITH section_labels(label, sort_order) AS (
            VALUES
              ('أ - فريق عمل البلاغات', 1),
              ('ب - فريق عمل البلاغات', 2),
              ('ج - فريق عمل البلاغات', 3),
              ('د - فريق عمل البلاغات', 4),
              ('فريق عمل البلاغات صباحاً', 5),
              ('أ - الخدمات', 6),
              ('ب - الخدمات', 7),
              ('ج - الخدمات', 8),
              ('د - الخدمات', 9),
              ('سكرتارية البلاغات', 10),
              ('سكرتارية العمليات', 11)
          ),
          source AS (
            SELECT DISTINCT EmpID, TRIM(Section) AS section_label
            FROM DailyAll_P
            WHERE Section IS NOT NULL AND TRIM(Section) <> ''
          )
          SELECT
            section_labels.label AS label,
            COUNT(source.EmpID) AS value
          FROM section_labels
          LEFT JOIN source ON source.section_label = section_labels.label
          GROUP BY section_labels.label, section_labels.sort_order
          ORDER BY section_labels.sort_order
        `).all()
      : [];

    const todaySummary = tableOrViewExists('EmpSummary_Today')
      ? db.prepare('SELECT * FROM EmpSummary_Today ORDER BY WorkDays DESC LIMIT 8').all()
      : [];

    const monthSummary = tableOrViewExists('EmpSummary_ThisMonth')
      ? db.prepare('SELECT * FROM EmpSummary_ThisMonth ORDER BY PresentDays DESC LIMIT 8').all()
      : [];

    const recentActivities = tableOrViewExists('SystemLog')
      ? db.prepare(`
          SELECT Timestamp, UserName, Action, Target, Details
          FROM SystemLog
          ORDER BY Timestamp DESC
          LIMIT 50
        `).all()
      : [];

    res.json({
      totals,
      departments,
      shifts,
      sections,
      todaySummary,
      monthSummary,
      recentActivities
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل ملخص الرئيسية' });
  }
});

module.exports = router;
