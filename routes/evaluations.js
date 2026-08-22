const express = require('express');
const { db } = require('../database');

const router = express.Router();
const validSummaries = new Set(['today', 'week', 'month', 'quarter', 'halfyear', 'year']);
const forcedScopes = new Set(['employee', 'department', 'section']);

const allDepartmentsOrder = [
  'البلاغات',
  'العمليات',
  'الخدمات المساندة',
  'الموارد البشرية',
  'المعلومات',
  'الاحصاء'
];

const allSectionsOrder = [
  { department: 'البلاغات', section: 'أ - البلاغات' },
  { department: 'البلاغات', section: 'ب - البلاغات' },
  { department: 'البلاغات', section: 'ج - البلاغات' },
  { department: 'البلاغات', section: 'د - البلاغات' },
  { department: 'البلاغات', section: 'هـ - البلاغات' },
  { department: 'البلاغات', section: 'ثابت صبح' },
  { department: 'البلاغات', section: 'أ - فريق عمل البلاغات' },
  { department: 'البلاغات', section: 'ب - فريق عمل البلاغات' },
  { department: 'البلاغات', section: 'ج - فريق عمل البلاغات' },
  { department: 'البلاغات', section: 'د - فريق عمل البلاغات' },
  { department: 'البلاغات', section: 'هـ - فريق عمل البلاغات' },
  { department: 'البلاغات', section: 'سكرتارية البلاغات' },
  { department: 'البلاغات', section: 'صباحاً' },
  { department: 'العمليات', section: 'أ - العمليات' },
  { department: 'العمليات', section: 'ب - العمليات' },
  { department: 'العمليات', section: 'ج - العمليات' },
  { department: 'العمليات', section: 'د - العمليات' },
  { department: 'العمليات', section: 'هـ - العمليات' },
  { department: 'العمليات', section: 'سكرتارية العمليات' },
  { department: 'العمليات', section: 'صباحاً' },
  { department: 'الخدمات المساندة', section: 'أ - الخدمات' },
  { department: 'الخدمات المساندة', section: 'ب - الخدمات' },
  { department: 'الخدمات المساندة', section: 'ج - الخدمات' },
  { department: 'الخدمات المساندة', section: 'د - الخدمات' },
  { department: 'الخدمات المساندة', section: 'هـ - الخدمات' },
  { department: 'الخدمات المساندة', section: 'سكرتارية الخدمات' },
  { department: 'الخدمات المساندة', section: 'صباحاً' }
];

function normalizeDateInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\//g, '-');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDepartment(value) {
  const text = String(value || '').trim();
  return text === 'الإحصاء' ? 'الاحصاء' : text;
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

function isDelayEntry(text) {
  const content = normalizeText(text);
  return content.includes('تأخير');
}

function isAssignmentEntry(text) {
  const content = normalizeText(text);
  return content.includes('تكليف');
}

function classifyDailyEntry(row) {
  const bucketText = [row.Status, row.Type, row.Note].filter(Boolean).join(' ');

  if (isMedicalEntry(bucketText)) return 'medical';
  if (isLeaveEntry(bucketText)) return 'leave';
  if (isLicenseEntry(bucketText)) return 'license';
  if (isPresentEntry(bucketText)) return 'present';
  if (isAbsentEntry(bucketText)) return 'absent';
  if (isDelayEntry(bucketText)) return 'delay';
  if (isAssignmentEntry(bucketText)) return 'assignment';
  return 'other';
}

function toNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function resolveMetrics(metrics) {
  return {
    totalCount: toNumber(metrics.totalCount ?? metrics.TotalCount),
    presentCount: toNumber(metrics.presentCount ?? metrics.PresentCount),
    licenseCount: toNumber(metrics.licenseCount ?? metrics.LicenseCount),
    absentCount: toNumber(metrics.absentCount ?? metrics.AbsentCount),
    leaveCount: toNumber(metrics.leaveCount ?? metrics.LeaveCount),
    medicalCount: toNumber(metrics.medicalCount ?? metrics.MedicalCount),
    delayCount: toNumber(metrics.delayCount ?? metrics.DelayCount),
    assignmentCount: toNumber(metrics.assignmentCount ?? metrics.AssignmentCount),
    otherCount: toNumber(metrics.otherCount ?? metrics.OtherCount)
  };
}

function calculatePercent(metrics) {
  const resolved = resolveMetrics(metrics);
  const denominator = resolved.totalCount || 0;
  if (!denominator) return 0;
  return Number(((resolved.presentCount / denominator) * 100).toFixed(2));
}

function getEvaluationProfile(percent, metrics) {
  const resolved = resolveMetrics(metrics);
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

  const hasHighAbsence = resolved.absentCount >= resolved.presentCount && (resolved.presentCount + resolved.absentCount) >= 5;
  if (hasHighAbsence && levelIndex < levels.length - 1) {
    levelIndex += 1;
  }

  const selected = levels[levelIndex];
  return { label: selected.label };
}

function buildPerformanceReason(metrics) {
  const resolved = resolveMetrics(metrics);
  const reasons = [];

  if (resolved.presentCount === resolved.totalCount && resolved.totalCount > 0) {
    return 'حضور كامل';
  }

  if (resolved.presentCount === 0 && (resolved.licenseCount + resolved.delayCount) === resolved.totalCount && resolved.totalCount > 0) {
    return 'استئذان أو تأخير طوال الفترة';
  }

  if (resolved.presentCount === 0 && resolved.totalCount > 0) {
    if (resolved.absentCount) reasons.push(`غياب ${resolved.absentCount}`);
    if (resolved.leaveCount) reasons.push(`إجازات ${resolved.leaveCount}`);
    if (resolved.medicalCount) reasons.push(`طبية ${resolved.medicalCount}`);
    if (resolved.assignmentCount) reasons.push(`تكليف ${resolved.assignmentCount}`);
    if (resolved.delayCount) reasons.push(`تأخير ${resolved.delayCount}`);
    if (resolved.licenseCount) reasons.push(`استئذان ${resolved.licenseCount}`);
    if (resolved.otherCount) reasons.push(`أخرى ${resolved.otherCount}`);
    return reasons.slice(0, 2).join('، ');
  }

  if (resolved.delayCount) reasons.push(`تأخير ${resolved.delayCount}`);
  if (resolved.licenseCount) reasons.push(`استئذان ${resolved.licenseCount}`);
  if (resolved.leaveCount) reasons.push(`إجازات ${resolved.leaveCount}`);
  if (resolved.medicalCount) reasons.push(`طبية ${resolved.medicalCount}`);
  if (resolved.assignmentCount) reasons.push(`تكليف ${resolved.assignmentCount}`);
  if (resolved.absentCount) reasons.push(`غياب ${resolved.absentCount}`);

  return reasons.slice(0, 2).join('، ');
}

function resolveReportScope(department, section, name, forcedScope = '') {
  const preferred = String(forcedScope || '').trim();
  if (forcedScopes.has(preferred)) {
    return preferred;
  }

  if (name) return 'employee';
  if (section || department) return 'employee';
  return 'employee';
}

function createEmptySummaryRow(groupKey, name) {
  return {
    GroupKey: groupKey,
    Name: name,
    PresentCount: 0,
    LicenseCount: 0,
    AbsentCount: 0,
    LeaveCount: 0,
    MedicalCount: 0,
    DelayCount: 0,
    AssignmentCount: 0,
    OtherCount: 0,
    TotalCount: 0,
    Percent: 0,
    Evaluation: getEvaluationProfile(0, {}).label,
    Notes: '',
    PreviousYearPercent: null,
    Rank: 0
  };
}

function sortAndRankRows(rows) {
  const sorted = [...rows].sort((a, b) => {
    if (Number(b.Percent || 0) !== Number(a.Percent || 0)) return Number(b.Percent || 0) - Number(a.Percent || 0);
    if (Number(b.PresentCount || 0) !== Number(a.PresentCount || 0)) return Number(b.PresentCount || 0) - Number(a.PresentCount || 0);
    return String(a.Name || '').localeCompare(String(b.Name || ''), 'ar');
  });

  sorted.forEach((item, index) => {
    item.Rank = index + 1;
  });

  return sorted;
}

function applyAllModeFilters(rows, mode) {
  const normalizedMode = String(mode || '').trim();
  if (!Array.isArray(rows) || !rows.length) {
    if (normalizedMode === 'allDepartments') {
      const baseRows = allDepartmentsOrder.map((department) =>
        createEmptySummaryRow(`department:${normalizeDepartment(department)}`, normalizeDepartment(department))
      );
      return sortAndRankRows(baseRows);
    }

    if (normalizedMode === 'allSections') {
      const baseRows = allSectionsOrder.map((item) =>
        createEmptySummaryRow(
          `section:${normalizeDepartment(item.department)}|${String(item.section || '').trim()}`,
          String(item.section || '').trim()
        )
      );
      return sortAndRankRows(baseRows);
    }

    return rows;
  }

  if (normalizedMode === 'allDepartments') {
    const allowed = new Set(allDepartmentsOrder.map((item) => normalizeDepartment(item)));
    const filtered = rows.filter((item) => allowed.has(normalizeDepartment(item.Name)));
    const byDepartment = new Map(filtered.map((item) => [normalizeDepartment(item.Name), item]));

    const completed = allDepartmentsOrder.map((department) => {
      const key = normalizeDepartment(department);
      return byDepartment.get(key) || createEmptySummaryRow(`department:${key}`, key);
    });

    return sortAndRankRows(completed);
  }

  if (normalizedMode === 'allSections') {
    const allowedKeys = new Set(
      allSectionsOrder.map((item) => `section:${normalizeDepartment(item.department)}|${String(item.section || '').trim()}`)
    );
    const filtered = rows.filter((item) => allowedKeys.has(String(item.GroupKey || '').trim()));
    const byKey = new Map(filtered.map((item) => [String(item.GroupKey || '').trim(), item]));

    const completed = allSectionsOrder.map((item) => {
      const key = `section:${normalizeDepartment(item.department)}|${String(item.section || '').trim()}`;
      return byKey.get(key) || createEmptySummaryRow(key, String(item.section || '').trim());
    });

    return sortAndRankRows(completed);
  }

  return rows;
}

function buildReportKey(row, scope) {
  const department = String(row.Department || '').trim();
  const section = String(row.Section || '').trim();
  const employeeId = String(row.EmpID || '').trim();
  const employeeName = String(row.Name || '').trim();

  if (scope === 'section') {
    return `section:${department}|${section}`;
  }

  if (scope === 'department') {
    return `department:${department}`;
  }

  return `employee:${employeeId || employeeName}`;
}

function buildReportDisplayName(row, scope) {
  if (scope === 'section') {
    return String(row.Section || '').trim() || String(row.Department || '').trim();
  }

  if (scope === 'department') {
    return String(row.Department || '').trim();
  }

  return String(row.Name || '').trim();
}

function summarizeRows(rows, scope) {
  const groupedRows = new Map();

  rows.forEach((row) => {
    const groupKey = buildReportKey(row, scope);
    const displayName = buildReportDisplayName(row, scope);
    if (!groupKey || !displayName) return;

    if (!groupedRows.has(groupKey)) {
      groupedRows.set(groupKey, {
        GroupKey: groupKey,
        Name: displayName,
        PresentCount: 0,
        LicenseCount: 0,
        AbsentCount: 0,
        LeaveCount: 0,
        MedicalCount: 0,
        DelayCount: 0,
        AssignmentCount: 0,
        OtherCount: 0,
        TotalCount: 0,
        Percent: 0,
        Evaluation: '',
        PerformanceReason: '',
        PreviousYearPercent: null,
        Rank: 0
      });
    }

    const item = groupedRows.get(groupKey);
    const classification = classifyDailyEntry(row);
    item.TotalCount += 1;

    if (classification === 'medical') {
      item.MedicalCount += 1;
      return;
    }

    if (classification === 'leave') {
      item.LeaveCount += 1;
      return;
    }

    if (classification === 'license') {
      item.LicenseCount += 1;
      return;
    }

    if (classification === 'present') {
      item.PresentCount += 1;
      return;
    }

    if (classification === 'absent') {
      item.AbsentCount += 1;
      return;
    }

    if (classification === 'delay') {
      item.DelayCount += 1;
      return;
    }

    if (classification === 'assignment') {
      item.AssignmentCount += 1;
      return;
    }

    item.OtherCount += 1;
  });

  const result = Array.from(groupedRows.values()).map((item) => {
    const percent = calculatePercent(item);
    const evaluationProfile = getEvaluationProfile(percent, item);
    const performanceReason = buildPerformanceReason(item);

    return {
      ...item,
      Percent: percent,
      Evaluation: evaluationProfile.label,
      Notes: performanceReason
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

function buildDailySourceQuery() {
  return `
    SELECT EmpID, Name, Status, Type, Note, Today, Department, Section, Period, ID FROM Daily1
    UNION ALL
    SELECT EmpID, Name, Status, Type, Note, Today, Department, Section, Period, ID FROM Daily2
    UNION ALL
    SELECT EmpID, Name, Status, Type, Note, Today, Department, Section, Period, ID FROM Daily3
    UNION ALL
    SELECT EmpID, Name, Status, Type, Note, Today, Department, Section, Period, ID FROM Daily4
  `;
}

function shiftDateYear(dateText, targetYear) {
  const normalized = normalizeDateInput(dateText);
  if (!normalized || !targetYear) return '';

  const parts = normalized.split('-');
  if (parts.length !== 3) return '';

  return `${String(targetYear).trim()}-${parts[1]}-${parts[2]}`;
}

router.get('/filters', (req, res) => {
  try {
    const currentYear = String(new Date().getFullYear());

    const periods = db.prepare(`
      SELECT DISTINCT TRIM(Period) AS value
      FROM (
        ${buildDailySourceQuery()}
      ) AS DailyUnion
      WHERE Period IS NOT NULL AND TRIM(Period) <> ''
      ORDER BY value ASC
    `).all().map((row) => row.value);

    const years = db.prepare(`
      SELECT DISTINCT strftime('%Y', date(REPLACE(Today, '/', '-'))) AS value
      FROM (
        ${buildDailySourceQuery()}
      ) AS DailyUnion
      WHERE Today IS NOT NULL AND TRIM(Today) <> '' AND strftime('%Y', date(REPLACE(Today, '/', '-'))) < ?
      ORDER BY value DESC
    `).all(currentYear).map((row) => row.value).filter(Boolean);

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
    const forcedScope = String(req.query.scope || '').trim();
    const mode = String(req.query.mode || '').trim();
    const reportScope = resolveReportScope(department, section, name, forcedScope);

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
      SELECT EmpID, Name, Status, Type, Note, Today, Department, Section, Period, ID
      FROM (
        ${buildDailySourceQuery()}
      ) AS DailyUnion
      ${whereClause}
      ORDER BY Name ASC, date(REPLACE(Today, '/', '-')) DESC, ID DESC
      LIMIT 10000
    `).all(...params);

    const reportRows = applyAllModeFilters(summarizeRows(rows, reportScope), mode);

    if (compareYear) {
      const previousFromDate = shiftDateYear(fromDate, compareYear);
      const previousToDate = shiftDateYear(toDate, compareYear);

      if (previousFromDate && previousToDate) {
        const previousQuery = buildDailyFilterQuery({
          department,
          section,
          period,
          name,
          fromDate: previousFromDate,
          toDate: previousToDate,
          compareYear: ''
        });

        const previousRows = db.prepare(`
          SELECT EmpID, Name, Status, Type, Note, Today, Department, Section, Period, ID
          FROM (
            ${buildDailySourceQuery()}
          ) AS DailyUnion
          ${previousQuery.whereClause}
          ORDER BY Name ASC, date(REPLACE(Today, '/', '-')) DESC, ID DESC
          LIMIT 10000
        `).all(...previousQuery.params);

        const previousReportRows = applyAllModeFilters(summarizeRows(previousRows, reportScope), mode);
        const previousByKey = new Map(previousReportRows.map((item) => [item.GroupKey, item]));

        reportRows.forEach((item) => {
          const previousItem = previousByKey.get(item.GroupKey);
          item.PreviousYearPercent = previousItem ? previousItem.Percent : null;
        });
      }
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
