const express = require('express');
const { db } = require('../database');

const router = express.Router();
const validSummaries = new Set(['today', 'week', 'month', 'quarter', 'halfyear', 'year']);

function normalizeDateInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\//g, '-');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function isMedicalEntry(text) {
  const content = normalizeText(text);
  return content.includes('طبي') || content.includes('مرضي') || content.includes('مرضي') || content.includes('medical');
}

function isLeaveEntry(text) {
  const content = normalizeText(text);
  return content.includes('إجاز') || content.includes('اجاز');
}

function isLicenseEntry(text) {
  const content = normalizeText(text);
  return content.includes('رخص') || content.includes('اذن') || content.includes('إذن') || content.includes('استئذان');
}

function isAbsentEntry(text) {
  const content = normalizeText(text);
  return content.includes('غياب');
}

function isPresentEntry(text) {
  const content = normalizeText(text);
  return content.includes('حضور');
}

function calculatePercent(present, absent, leave, license, medical) {
  const denominator = present + absent + leave + license + medical;
  if (!denominator) return 0;
  return Number(((present / denominator) * 100).toFixed(2));
}

function getEvaluationProfile(percent, present, absent) {
  const levels = [
    { min: 97, label: 'ممتاز' },
    { min: 93, label: 'ممتاز جدا' },
    { min: 88, label: 'جيد جدا' },
    { min: 80, label: 'جيد' },
    { min: 70, label: 'مقبول' },
    { min: 0, label: 'ضعيف' }
  ];

  let levelIndex = levels.findIndex((item) => percent >= item.min);
  if (levelIndex < 0) levelIndex = levels.length - 1;

  // Apply one-step downgrade when absenteeism is high enough to impact operational reliability.
  const hasHighAbsence = absent >= present && (present + absent) >= 5;
  if (hasHighAbsence && levelIndex < levels.length - 1) {
    levelIndex += 1;
  }

  const selected = levels[levelIndex];
  return { label: selected.label };
}

function summarizeRows(rows) {
  const byEmployee = new Map();

  rows.forEach((row) => {
    const name = String(row.Name || '').trim();
    if (!name) return;

    if (!byEmployee.has(name)) {
      byEmployee.set(name, {
        Name: name,
        PresentCount: 0,
        LicenseCount: 0,
        AbsentCount: 0,
        LeaveCount: 0,
        MedicalCount: 0,
        Percent: 0,
        Evaluation: '',
        Rank: 0
      });
    }

    const item = byEmployee.get(name);
    const bucketText = [row.Status, row.Type, row.Note].filter(Boolean).join(' ');

    if (isMedicalEntry(bucketText)) {
      item.MedicalCount += 1;
      return;
    }

    if (isLeaveEntry(bucketText)) {
      item.LeaveCount += 1;
      return;
    }

    if (isLicenseEntry(bucketText)) {
      item.LicenseCount += 1;
      return;
    }

    if (isPresentEntry(bucketText)) {
      item.PresentCount += 1;
      return;
    }

    if (isAbsentEntry(bucketText)) {
      item.AbsentCount += 1;
    }
  });

  const result = Array.from(byEmployee.values()).map((item) => {
    const percent = calculatePercent(
      item.PresentCount,
      item.AbsentCount,
      item.LeaveCount,
      item.LicenseCount,
      item.MedicalCount
    );

    const evaluationProfile = getEvaluationProfile(percent, item.PresentCount, item.AbsentCount);

    return {
      ...item,
      Percent: percent,
      Evaluation: evaluationProfile.label
    };
  });

  result.sort((a, b) => {
    if (b.Percent !== a.Percent) return b.Percent - a.Percent;
    if (b.PresentCount !== a.PresentCount) return b.PresentCount - a.PresentCount;
    return a.Name.localeCompare(b.Name, 'ar');
  });

  result.forEach((item, index) => {
    item.Rank = index + 1;
  });

  return result;
}

function buildDailyFilterQuery({ department, section, period, name, fromDate, toDate, compareYear }) {
  const filters = [];
  const params = [];

  if (department) {
    filters.push('TRIM(Department) = ?');
    params.push(String(department).trim());
  }

  if (section) {
    filters.push('TRIM(Section) = ?');
    params.push(String(section).trim());
  }

  if (period) {
    filters.push('TRIM(Period) = ?');
    params.push(String(period).trim());
  }

  if (name) {
    filters.push('TRIM(Name) = ?');
    params.push(String(name).trim());
  }

  if (fromDate) {
    filters.push("date(REPLACE(Today, '/', '-')) >= date(?)");
    params.push(fromDate);
  }

  if (toDate) {
    filters.push("date(REPLACE(Today, '/', '-')) <= date(?)");
    params.push(toDate);
  }

  if (compareYear) {
    filters.push("strftime('%Y', date(REPLACE(Today, '/', '-'))) = ?");
    params.push(String(compareYear));
  }

  return {
    whereClause: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    params
  };
}

router.get('/filters', (req, res) => {
  try {
    const periods = db.prepare(`
      SELECT DISTINCT TRIM(Period) AS value
      FROM DailyAll
      WHERE Period IS NOT NULL AND TRIM(Period) <> ''
      ORDER BY value ASC
    `).all().map((row) => row.value);

    const years = db.prepare(`
      SELECT DISTINCT strftime('%Y', date(REPLACE(Today, '/', '-'))) AS value
      FROM DailyAll
      WHERE Today IS NOT NULL AND TRIM(Today) <> ''
      ORDER BY value DESC
    `).all().map((row) => row.value).filter(Boolean);

    res.json({ periods, years });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل خيارات التقييم' });
  }
});

router.get('/report', (req, res) => {
  try {
    const department = String(req.query.department || '').trim();
    const section = String(req.query.section || '').trim();
    const period = String(req.query.period || '').trim();
    const name = String(req.query.name || '').trim();
    const fromDate = normalizeDateInput(req.query.fromDate);
    const toDate = normalizeDateInput(req.query.toDate);
    const compareYear = String(req.query.compareYear || '').trim();

    const { whereClause, params } = buildDailyFilterQuery({
      department,
      section,
      period,
      name,
      fromDate,
      toDate,
      compareYear: ''
    });

    const rows = db.prepare(`
      SELECT Name, Status, Type, Note, Today, Department, Section, Period
      FROM DailyAll
      ${whereClause}
      ORDER BY Name ASC, date(REPLACE(Today, '/', '-')) DESC, ID DESC
      LIMIT 10000
    `).all(...params);

    const reportRows = summarizeRows(rows);

    if (compareYear) {
      // Preserve compare-year filtering behavior in report inputs without notes output.
    }

    res.json({ rows: reportRows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل تقرير تقييم الأداء' });
  }
});

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
