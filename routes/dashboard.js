const express = require('express');
const { db } = require('../database');
const { localizeRecord } = require('../services/systemLogLocalization');
const router = express.Router();

async function replaceEmployeeIdWithName(record) {
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
      const source = (await db.prepare(`SELECT Name FROM "${String(mapping.table || '').replace(/"/g, '""')}" WHERE ID = ? LIMIT 1`).get(rowId));
      const name = String((source && source.Name) || '').trim();
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

async function tableOrViewExists(name) {
  const row = (await db.prepare("SELECT 1 AS found FROM sqlite_master WHERE name = ? AND type IN ('table','view') LIMIT 1").get(name));
  return Boolean(row);
}

async function getTodaySqlDate() {
  return (await db.prepare("SELECT date('now', 'localtime') AS value").get()).value;
}

async function countActiveEmployees() {
  if (!(await tableOrViewExists('Main'))) return 0;

  return (await db.prepare("SELECT COUNT(*) AS count FROM Main WHERE TRIM(Status) = 'نشط'").get()).count;
}

async function countOutsideEmployees() {
  if (!(await tableOrViewExists('Main'))) return 0;

  return (await db.prepare("SELECT COUNT(*) AS count FROM Main WHERE TRIM(Status) = 'غير نشط'").get()).count;
}

async function countOngoingRecords(tableName) {
  if (!(await tableOrViewExists(tableName))) return 0;

  const today = (await getTodaySqlDate());
  return (await db.prepare(`
    SELECT COUNT(*) AS count
    FROM ${tableName}
    WHERE date(REPLACE(Startdate, '/', '-')) <= date(?)
      AND date(REPLACE(Enddate, '/', '-')) >= date(?)
  `).get(today, today)).count;
}

async function countUpcomingHolidays() {
  if (!(await tableOrViewExists('Holiday'))) return 0;

  return (await db.prepare(`
    SELECT COUNT(*) AS count
    FROM Holiday
    WHERE date(REPLACE(Startdate, '/', '-')) > date('now', 'localtime')
      AND date(REPLACE(Startdate, '/', '-')) <= date('now', 'localtime', '+3 day')
  `).get()).count;
}

async function summarizeDocumentTable(tableName, dateColumn, numberColumn, subjectColumn, extraColumn) {
  if (!(await tableOrViewExists(tableName))) {
    return {
      total: 0,
      latest: null
    };
  }

  const total = (await db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get()).count;
  const latest = (await db.prepare(`
    SELECT ${numberColumn} AS numberValue, ${dateColumn} AS dateValue, ${subjectColumn} AS subjectValue${extraColumn ? `, ${extraColumn} AS extraValue` : ''}
    FROM ${tableName}
    ORDER BY date(REPLACE(${dateColumn}, '/', '-')) DESC, ID DESC
    LIMIT 1
  `).get());

  return {
    total,
    latest: latest ? {
      number: String(latest.numberValue || '').trim(),
      date: String(latest.dateValue || '').trim(),
      subject: String(latest.subjectValue || '').trim(),
      extra: String(latest.extraValue || '').trim()
    } : null
  };
}

router.get('/summary', async (req, res) => {
  try {
    const totals = {
      totalEmployees: (await countActiveEmployees()),
      totalDailyRecords: (await tableOrViewExists('DailyAll')) ? (await db.prepare('SELECT COUNT(*) AS count FROM DailyAll').get()).count : 0,
      currentHolidays: (await countOngoingRecords('Holiday')),
      upcomingHolidays: (await countUpcomingHolidays()),
      totalHolidays: (await tableOrViewExists('Holiday'))
        ? (await db.prepare(`
            SELECT COUNT(*) AS count
            FROM Holiday
            WHERE date(REPLACE(Enddate, '/', '-')) >= date('now', 'localtime')
          `).get()).count
        : 0,
      totalCourses: (await countOngoingRecords('Course')),
      totalTransfers: (await countOutsideEmployees()),
      totalUsers: (await tableOrViewExists('Login')) ? (await db.prepare('SELECT COUNT(*) AS count FROM Login').get()).count : 0,
      totalSystemEvents: (await tableOrViewExists('SystemLog')) ? (await db.prepare('SELECT COUNT(*) AS count FROM SystemLog').get()).count : 0,
      totalMonthlyRecords: (await tableOrViewExists('DailyAll'))
        ? (await db.prepare("SELECT COUNT(*) AS count FROM DailyAll WHERE strftime('%Y-%m', Today) = strftime('%Y-%m', 'now')").get()).count
        : 0
    };

    const outgoingSummary = (await summarizeDocumentTable('OutgoingDocuments', 'DocDate', 'DocNumber', 'Subject', 'Recipient'));
    const incomingSummary = (await summarizeDocumentTable('IncomingDocuments', 'DocDate', 'DocNumber', 'Subject', 'SourceDepartment'));

    const departments = (await tableOrViewExists('Main'))
      ? (await db.prepare(`
          WITH department_labels(label, sort_order) AS (
            VALUES
              ('البلاغات', 1),
              ('العمليات', 2),
              ('الخدمات المساندة', 3),
              ('الموارد البشرية', 4),
              ('المعلومات', 5),
              ('الاحصاء', 6)
          )
          SELECT
            department_labels.label AS label,
            COUNT(Main.ID) AS value
          FROM department_labels
          LEFT JOIN Main ON TRIM(Main.Department) = department_labels.label AND TRIM(Main.Status) = 'نشط'
          GROUP BY department_labels.label, department_labels.sort_order
          ORDER BY department_labels.sort_order
        `).all())
      : [];

    const shifts = (await tableOrViewExists('Main'))
      ? (await db.prepare(`
          WITH shift_labels(label, sort_order) AS (
            VALUES
              ('أ - البلاغات', 1),
              ('ب - البلاغات', 2),
              ('ج - البلاغات', 3),
              ('د - البلاغات', 4),
              ('هـ - البلاغات', 5),
              ('ثابت صبح', 6),
              ('أ - فريق عمل البلاغات', 7),
              ('ب - فريق عمل البلاغات', 8),
              ('ج - فريق عمل البلاغات', 9),
              ('د - فريق عمل البلاغات', 10),
              ('هـ - فريق عمل البلاغات', 11),
              ('سكرتارية البلاغات', 12),
              ('صباحاً', 13),
              ('أ - العمليات', 14),
              ('ب - العمليات', 15),
              ('ج - العمليات', 16),
              ('د - العمليات', 17),
              ('هـ - العمليات', 18),
              ('سكرتارية العمليات', 19),
              ('أ - الخدمات', 20),
              ('ب - الخدمات', 21),
              ('ج - الخدمات', 22),
              ('د - الخدمات', 23),
              ('هـ - الخدمات', 24),
              ('سكرتارية الخدمات', 25)
          )
          SELECT
            shift_labels.label AS label,
            COUNT(Main.ID) AS value
          FROM shift_labels
          LEFT JOIN Main ON TRIM(Main.Section) = shift_labels.label AND TRIM(Main.Status) = 'نشط'
          GROUP BY shift_labels.label, shift_labels.sort_order
          ORDER BY shift_labels.sort_order
        `).all())
      : [];

    const workplaces = (await tableOrViewExists('Main'))
      ? (await db.prepare(`
          SELECT
            TRIM(Work) AS label,
            COUNT(*) AS value
          FROM Main
          WHERE TRIM(Status) = 'نشط'
            AND TRIM(Work) <> ''
          GROUP BY TRIM(Work)
          ORDER BY value DESC, label ASC
          LIMIT 10
        `).all())
      : [];

    const sections = [];

    let todaySummary = [];
    let latestDailyShift = null;
    if ((await tableOrViewExists('DailyAll'))) {
      const dailyTables = new Set(['Daily1', 'Daily2', 'Daily3', 'Daily4']);
      const latestDailyAdd = (await tableOrViewExists('SystemLog'))
        ? (await db.prepare(`
            SELECT Target, Details
            FROM SystemLog
            WHERE LOWER(TRIM(Action)) = 'add'
              AND Target IN ('Daily1', 'Daily2', 'Daily3', 'Daily4')
            ORDER BY datetime(Timestamp) DESC, ID DESC
            LIMIT 1
          `).get())
        : null;

      if (latestDailyAdd && dailyTables.has(latestDailyAdd.Target)) {
        const recordIdMatch = String(latestDailyAdd.Details || '').match(/daily record ID=(\d+)/i);
        const batchDateMatch = String(latestDailyAdd.Details || '').match(/\bon\s+(\d{4}[/-]\d{2}[/-]\d{2})/i);
        const recordId = recordIdMatch && recordIdMatch[1];
        const batchDate = batchDateMatch && batchDateMatch[1];
        const sourceFilter = recordId
          ? { clause: 'ID = ?', value: Number(recordId) }
          : batchDate
            ? { clause: "date(REPLACE(Today, '/', '-')) = date(?)", value: batchDate }
            : null;

        if (sourceFilter) {
          latestDailyShift = (await db.prepare(`
            SELECT
              date(REPLACE(Today, '/', '-')) AS logDate,
              TRIM(Department) AS department,
              TRIM(Section) AS section,
              TRIM(Period) AS period
            FROM ${latestDailyAdd.Target}
            WHERE ${sourceFilter.clause}
              AND TRIM(Department) <> ''
              AND TRIM(Section) <> ''
              AND TRIM(Period) <> ''
            ORDER BY ID DESC
            LIMIT 1
          `).get(sourceFilter.value));
        }
      }

      if (!latestDailyShift) {
        latestDailyShift = (await db.prepare(`
          SELECT
            date(REPLACE(Today, '/', '-')) AS logDate,
            TRIM(Department) AS department,
            TRIM(Section) AS section,
            TRIM(Period) AS period
          FROM DailyAll
          WHERE Today IS NOT NULL AND TRIM(Today) <> ''
            AND TRIM(Department) <> ''
            AND TRIM(Section) <> ''
            AND TRIM(Period) <> ''
          ORDER BY date(REPLACE(Today, '/', '-')) DESC, ID DESC
          LIMIT 1
        `).get());
      }

      if (latestDailyShift && latestDailyShift.logDate && latestDailyShift.department && latestDailyShift.section && latestDailyShift.period) {
        todaySummary = (await db.prepare(`
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
            AND TRIM(Department) = ?
            AND TRIM(Section) = ?
            AND TRIM(Period) = ?
          ORDER BY Name ASC
          LIMIT 60
        `).all(
          latestDailyShift.logDate,
          latestDailyShift.department,
          latestDailyShift.section,
          latestDailyShift.period
        ));
      }
    }

    const leaveDailySummary = (await tableOrViewExists('Holiday'))
      ? (await db.prepare(`
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
        `).all((await getTodaySqlDate()), (await getTodaySqlDate())))
      : [];

    const recentActivities = (await tableOrViewExists('SystemLog'))
      ? (await Promise.all((await db.prepare(`
            SELECT Timestamp, UserName, Action, Target, Details, Machine, AppVersion
            FROM SystemLog
            WHERE date(Timestamp) BETWEEN date('now', 'localtime', '-2 day') AND date('now', 'localtime')
            ORDER BY Timestamp DESC
          `).all()).map(replaceEmployeeIdWithName))).map(localizeRecord)
      : [];

    res.json({
      totals,
      departments,
      shifts,
      sections,
      workplaces,
      outgoingSummary,
      incomingSummary,
      todaySummary,
      latestDailyShift,
      leaveDailySummary,
      recentActivities
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل ملخص الرئيسية' });
  }
});

module.exports = router;
