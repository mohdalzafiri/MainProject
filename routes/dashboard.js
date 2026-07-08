const express = require('express');
const { db } = require('../database');
const router = express.Router();

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

function tableOrViewExists(name) {
  const row = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE name = ? AND type IN ('table','view') LIMIT 1").get(name);
  return Boolean(row);
}

function getTodaySqlDate() {
  return db.prepare("SELECT date('now', 'localtime') AS value").get().value;
}

function countActiveEmployees() {
  if (!tableOrViewExists('Main')) return 0;

  return db.prepare("SELECT COUNT(*) AS count FROM Main WHERE TRIM(Status) = 'نشط'").get().count;
}

function countOutsideEmployees() {
  if (!tableOrViewExists('Main')) return 0;

  return db.prepare("SELECT COUNT(*) AS count FROM Main WHERE TRIM(Status) = 'غير نشط'").get().count;
}

function countOngoingRecords(tableName) {
  if (!tableOrViewExists(tableName)) return 0;

  const today = getTodaySqlDate();
  return db.prepare(`
    SELECT COUNT(*) AS count
    FROM ${tableName}
    WHERE date(REPLACE(Startdate, '/', '-')) <= date(?)
      AND date(REPLACE(Enddate, '/', '-')) >= date(?)
  `).get(today, today).count;
}

router.get('/summary', (req, res) => {
  try {
    const totals = {
      totalEmployees: countActiveEmployees(),
      totalDailyRecords: tableOrViewExists('DailyAll') ? db.prepare('SELECT COUNT(*) AS count FROM DailyAll').get().count : 0,
      totalHolidays: countOngoingRecords('Holiday'),
      totalCourses: countOngoingRecords('Course'),
      totalTransfers: countOutsideEmployees(),
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

    let todaySummary = [];
    if (tableOrViewExists('DailyAll')) {
      const latestShift = db.prepare(`
        SELECT date(REPLACE(Today, '/', '-')) AS logDate, TRIM(Period) AS period
        FROM DailyAll
        WHERE Today IS NOT NULL AND TRIM(Today) <> ''
          AND date(REPLACE(Today, '/', '-')) = date('now', 'localtime')
        ORDER BY ID DESC
        LIMIT 1
      `).get();

      if (latestShift?.logDate && latestShift?.period) {
        todaySummary = db.prepare(`
          SELECT
            Name,
            Status,
            Period,
            InTime,
            OutTime,
            Startdate,
            Enddate,
            Type,
            Note
          FROM DailyAll
          WHERE date(REPLACE(Today, '/', '-')) = date(?)
            AND TRIM(Period) = ?
          ORDER BY Name ASC
          LIMIT 60
        `).all(latestShift.logDate, latestShift.period);
      }
    }

    const leaveDailySummary = tableOrViewExists('Holiday')
      ? db.prepare(`
          SELECT
            Name,
            Department,
            Section AS Shift,
            Type,
            Startdate,
            Enddate
          FROM Holiday
          WHERE date(REPLACE(Startdate, '/', '-')) <= date(?)
            AND date(REPLACE(Enddate, '/', '-')) >= date(?)
          ORDER BY date(REPLACE(Enddate, '/', '-')) ASC, date(REPLACE(Startdate, '/', '-')) ASC, Name ASC
          LIMIT 12
        `).all(getTodaySqlDate(), getTodaySqlDate())
      : [];

    const recentActivities = tableOrViewExists('SystemLog')
      ? db.prepare(`
          SELECT Timestamp, UserName, Action, Target, Details
          FROM SystemLog
          WHERE date(Timestamp) BETWEEN date('now', 'localtime', '-2 day') AND date('now', 'localtime')
          ORDER BY Timestamp DESC
        `).all().map(replaceEmployeeIdWithName)
      : [];

    res.json({
      totals,
      departments,
      shifts,
      sections,
      todaySummary,
      leaveDailySummary,
      recentActivities
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل ملخص الرئيسية' });
  }
});

module.exports = router;
