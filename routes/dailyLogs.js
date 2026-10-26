const express = require('express');
const { db, dailyTables, isValidDailyTable, logSystem } = require('../database');
const { filterByDataScope, isWithinDataScope } = require('../auth/dataScope');
const { ensureDailyScanSectionDirectory } = require('../services/dailyScanStorage');
const statusCatalog = require('../public/status-catalog');

const router = express.Router();

const periods = [
  'نوبة صبح',
  'نوبة عصر',
  'نوبة ليل',
  'صباحاً'
];

const departmentOrder = [
  'البلاغات',
  'العمليات',
  'الخدمات المساندة',
  'الموارد البشرية',
  'المعلومات',
  'الاحصاء'
];

const periodTimes = {
  'نوبة صبح': { inTime: '08:00', outTime: '16:00' },
  'نوبة عصر': { inTime: '16:00', outTime: '00:00' },
  'نوبة ليل': { inTime: '00:00', outTime: '08:00' },
  'صباحاً': { inTime: '07:30', outTime: '14:30' }
};

const tableSections = {
  Daily1: [
    'أ - البلاغات', 'ب - البلاغات', 'ج - البلاغات', 'د - البلاغات', 'هـ - البلاغات', 'ثابت صبح',
    'أ - فريق عمل البلاغات', 'ب - فريق عمل البلاغات', 'ج - فريق عمل البلاغات', 'د - فريق عمل البلاغات',
    'هـ - فريق عمل البلاغات', 'سكرتارية البلاغات', 'صباحاً'
  ],
  Daily2: [
    'أ - العمليات', 'ب - العمليات', 'ج - العمليات', 'د - العمليات', 'هـ - العمليات', 'سكرتارية العمليات', 'صباحاً'
  ],
  Daily3: [
    'أ - الخدمات', 'ب - الخدمات', 'ج - الخدمات', 'د - الخدمات', 'هـ - الخدمات', 'سكرتارية الخدمات', 'صباحاً'
  ],
  Daily4: []
};

const columns = ['EmpID', 'Day', 'Today', 'Name', 'Department', 'Section', 'Status', 'Period', 'InTime', 'OutTime', 'Startdate', 'Enddate', 'Type', 'Note'];

function normalizeDepartment(value) {
  const text = String(value || '').trim();
  if (text === 'الإحصاء') return 'الاحصاء';
  return text;
}

function normalizeDateInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\//g, '-');
}

function toSlashDate(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return '';
  const parts = normalized.split('-');
  if (parts.length !== 3) return '';
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
}

function getPermissionMinutes() {
  return 120;
}

function applyStatusRules(payload) {
  const normalized = { ...payload };
  normalized.Status = statusCatalog.normalizeStatus(normalized.Status);

  if (statusCatalog.isAdjustedStatus(normalized.Status)) {
    const description = String(normalized.Type || '').trim();
    const defaults = periodTimes[String(normalized.Period || '').trim()] || { inTime: '', outTime: '' };
    const times = statusCatalog.getAdjustedTimes(defaults, description);
    normalized.InTime = times.inTime;
    normalized.OutTime = times.outTime;
  }

  return normalized;
}

function getMonthBounds(value) {
  const match = normalizeDateInput(value).match(/^(\d{4})-(\d{1,2})-\d{1,2}$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const lastDay = new Date(year, month, 0).getDate();
  const monthText = String(month).padStart(2, '0');
  return {
    from: `${year}-${monthText}-01`,
    to: `${year}-${monthText}-${String(lastDay).padStart(2, '0')}`
  };
}

function getPermissionSourceQuery() {
  return dailyTables.map((table) => `
    SELECT '${table}' AS SourceTable, ID, EmpID, Name, Today, Status, InTime, OutTime
    FROM ${table}
  `).join(' UNION ALL ');
}

async function getMonthlyPermissionUsage(record, excludedTable = '', excludedId = 0) {
  const today = normalizeDateInput(record.Today);
  const name = String(record.Name || '').trim();
  const empId = String(record.EmpID || '').trim();
  const bounds = getMonthBounds(today);
  if (!today || !bounds || (!empId && !name)) return { count: 0, minutes: 0 };

  const records = (await db.prepare(`
    SELECT SourceTable, ID, InTime, OutTime
    FROM (${getPermissionSourceQuery()}) AS DailyPermissions
    WHERE TRIM(Status) IN ('أذن', 'استئذان', 'إذن', 'اذن')
      AND date(REPLACE(Today, '/', '-')) BETWEEN date(?) AND date(?)
      AND (
        (EmpID IS NOT NULL AND CAST(EmpID AS TEXT) = ?)
        OR TRIM(Name) = ?
      )
  `).all(bounds.from, bounds.to, empId, name)).filter((item) =>
    String(item.SourceTable || '') !== excludedTable || Number(item.ID) !== Number(excludedId)
  );

  return {
    count: records.length,
    minutes: records.reduce((sum) => sum + getPermissionMinutes(), 0)
  };
}

async function validateMonthlyPermissionLimit(record, excludedTable = '', excludedId = 0) {
  if (!statusCatalog.isPermissionStatus(record.Status)) return '';

  const usage = (await getMonthlyPermissionUsage(record, excludedTable, excludedId));
  const totalCount = usage.count + 1;
  const totalMinutes = usage.minutes + getPermissionMinutes();

  if (totalCount > 4) {
    return `لا يمكن تسجيل الأذن: الحد الشهري هو 4 أذونات، والمستخدم حاليًا ${totalCount} أذونات.`;
  }

  if (totalMinutes > (12 * 60)) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `لا يمكن تسجيل الأذن: إجمالي ساعات الأذن للشهر أصبح ${hours}:${String(minutes).padStart(2, '0')} ويتجاوز الحد المسموح 12:00 ساعة.`;
  }

  return '';
}

function getArabicDay(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return '';
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return dayNames[date.getDay()] || '';
}

function resolveDailyTableByDepartment(department) {
  const value = normalizeDepartment(department);
  if (value === 'البلاغات') return 'Daily1';
  if (value === 'العمليات') return 'Daily2';
  if (value === 'الخدمات المساندة') return 'Daily3';
  if (['الموارد البشرية', 'المعلومات', 'الاحصاء'].includes(value)) return 'Daily4';
  return '';
}

async function getLookupDepartments() {
  const departments = (await db.prepare(`
    SELECT DISTINCT TRIM(Department) AS value
    FROM DepartmentSectionLookup
    WHERE IsActive = 1 AND TRIM(Department) <> ''
    ORDER BY SortOrder ASC, ID ASC
  `).all()).map((row) => normalizeDepartment(row.value));

  const known = departmentOrder.filter((department) => departments.includes(department));
  const extra = departments.filter((department) => !departmentOrder.includes(department));
  return [...known, ...extra];
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

async function findActiveEmployees(department, section = '') {
  const normalizedDepartment = normalizeDepartment(department);
  const normalizedSection = String(section || '').trim();

  if (!normalizedDepartment) {
    return (await db.prepare(`
      SELECT ID AS EmpID, Name, Department, Section, SubSection
      FROM Main
      WHERE TRIM(Status) = 'نشط'
      ORDER BY Name ASC
    `).all());
  }

  const baseSql = `
    SELECT ID AS EmpID, Name, Department, Section, SubSection
    FROM Main
    WHERE TRIM(Status) = 'نشط'
      AND (
        CASE WHEN TRIM(Department) = 'الإحصاء' THEN 'الاحصاء' ELSE TRIM(Department) END
      ) = ?
  `;

  if (!normalizedSection) {
    return (await db.prepare(`${baseSql} ORDER BY Name ASC`).all(normalizedDepartment));
  }

  return (await db.prepare(`${baseSql} AND TRIM(Section) = ? ORDER BY Name ASC`).all(normalizedDepartment, normalizedSection));
}

function filterEmployeesByExactName(employees, employeeName) {
  const target = String(employeeName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!target) return employees;
  return employees.filter((employee) => String(employee.Name || '').trim().toLowerCase().replace(/\s+/g, ' ') === target);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

async function findLeaveForDate(empID, name, dateValue) {
  return (await db.prepare(`
    SELECT Type, Startdate, Enddate, Note
    FROM Holiday
    WHERE (
      (EmpID IS NOT NULL AND CAST(EmpID AS TEXT) = CAST(? AS TEXT))
      OR TRIM(Name) = ?
    )
      AND date(REPLACE(Startdate, '/', '-')) <= date(?)
      AND date(REPLACE(Enddate, '/', '-')) >= date(?)
    ORDER BY date(REPLACE(Enddate, '/', '-')) DESC, ID DESC
    LIMIT 1
  `).get(empID, String(name || '').trim(), dateValue, dateValue));
}

async function findCourseForDate(empID, name, dateValue) {
  return (await db.prepare(`
    SELECT CourseName, Startdate, Enddate, Note
    FROM Course
    WHERE (
      (EmpID IS NOT NULL AND CAST(EmpID AS TEXT) = CAST(? AS TEXT))
      OR TRIM(Name) = ?
    )
      AND date(REPLACE(Startdate, '/', '-')) <= date(?)
      AND date(REPLACE(Enddate, '/', '-')) >= date(?)
    ORDER BY date(REPLACE(Enddate, '/', '-')) DESC, ID DESC
    LIMIT 1
  `).get(empID, String(name || '').trim(), dateValue, dateValue));
}

async function hasSameEmployeeInDaily(table, empID, name, dateValue, period) {
  const row = (await db.prepare(`
    SELECT ID
    FROM ${table}
    WHERE date(REPLACE(Today, '/', '-')) = date(?)
      AND TRIM(Period) = ?
      AND (
        (EmpID IS NOT NULL AND CAST(EmpID AS TEXT) = CAST(? AS TEXT))
        OR TRIM(Name) = ?
      )
    LIMIT 1
  `).get(dateValue, String(period || '').trim(), empID, String(name || '').trim()));

  return Boolean(row);
}

router.get('/', async (req, res) => {
  const records = (await db.prepare(`
    SELECT ID, EmpID, Day, Today, Name, Department, Section, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note
    FROM DailyAll
    ORDER BY date(REPLACE(Today, '/', '-')) DESC, Name ASC, ID DESC
    LIMIT 1000
  `).all());
  res.json(filterByDataScope(records, req.access));
});

router.get('/tables', (req, res) => {
  res.json(dailyTables);
});

router.get('/filters', async (req, res) => {
  try {
    const departmentSections = filterByDataScope((await db.prepare(`
      SELECT Department, Section, SubSection, SortOrder
      FROM DepartmentSectionLookup
      WHERE IsActive = 1
      ORDER BY SortOrder ASC, ID ASC
    `).all()), req.access);

    res.json({
      departments: [...new Set(departmentSections.map((row) => normalizeDepartment(row.Department)))],
      departmentSections: departmentSections.map((row) => ({
        Department: normalizeDepartment(row.Department),
        Section: String(row.Section || '').trim(),
        SortOrder: row.SortOrder
      })),
      periods,
      statuses: statusCatalog.statuses
    });
  } catch (error) {
    console.error(error);
    // Keep UI functional when database storage is temporarily unavailable.
    res.json({
      departments: [],
      departmentSections: [],
      periods,
      statuses: statusCatalog.statuses
    });
  }
});

router.get('/permission-summary', async (req, res) => {
  try {
    const excludedTable = isValidDailyTable(req.query.table) ? req.query.table : '';
    const excludedId = Number(req.query.id) || 0;
    const usage = (await getMonthlyPermissionUsage({
      Today: req.query.today,
      EmpID: req.query.empId,
      Name: req.query.name
    }, excludedTable, excludedId));

    res.json({
      usedCount: usage.count,
      usedMinutes: usage.minutes,
      remainingCount: Math.max(0, 4 - usage.count),
      remainingMinutes: Math.max(0, (12 * 60) - usage.minutes),
      exceeded: usage.count >= 4 || usage.minutes >= (12 * 60)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر حساب رصيد الأذن الشهري للموظف.' });
  }
});

router.get('/recorded-sections', async (req, res) => {
  try {
    const dateValue = normalizeDateInput(req.query.today);
    const department = normalizeDepartment(req.query.department);
    if (!dateValue || !department) {
      return res.json({ sections: [] });
    }

    const sections = (await db.prepare(`
      SELECT TRIM(Section) AS Section
      FROM DailyAll
      WHERE date(REPLACE(Today, '/', '-')) = date(?)
        AND (
          CASE WHEN TRIM(Department) = 'الإحصاء' THEN 'الاحصاء' ELSE TRIM(Department) END
        ) = ?
        AND TRIM(Section) <> ''
      GROUP BY TRIM(Section)
      ORDER BY MIN(ID) ASC
    `).all(dateValue, department)).map((row) => String(row.Section || '').trim()).filter(Boolean);

    res.json({
      sections: sections.filter((section) => isWithinDataScope({
        Department: department,
        Section: section
      }, req.access))
    });
  } catch (error) {
    console.error(error);
    res.json({ sections: [] });
  }
});

router.get('/employee-suggestions', async (req, res) => {
  try {
    const keyword = String(req.query.q || '').trim();
    const department = normalizeDepartment(req.query.department);
    const section = String(req.query.section || '').trim();

    if (!keyword || !department || !section) {
      return res.json({ items: [] });
    }

    const suggestions = filterByDataScope((await db.prepare(`
      SELECT ID AS EmpID, Name, Department, Section, SubSection
      FROM Main
      WHERE TRIM(Status) = 'نشط'
        AND TRIM(Name) LIKE ?
      ORDER BY Name ASC
    `).all(`%${keyword}%`)), req.access).slice(0, 60);

    const items = [];
    const seenNames = new Set();

    suggestions.forEach((row) => {
      const name = String(row.Name || '').trim();
      const empID = String(row.EmpID || '').trim();
      if (!name) return;

      const normalizedName = normalizeName(name);
      if (!normalizedName || seenNames.has(normalizedName)) return;
      seenNames.add(normalizedName);

      const departmentMatch = normalizeDepartment(row.Department) === department;
      const sectionMatch = !section || String(row.Section || '').trim() === section;
      items.push({
        EmpID: empID || null,
        Name: name,
        Department: normalizeDepartment(row.Department),
        Section: String(row.Section || '').trim(),
        departmentMatch,
        sectionMatch
      });
    });

    items.sort((left, right) => {
      const rankLeft = (left.departmentMatch ? 2 : 0) + (left.sectionMatch ? 1 : 0);
      const rankRight = (right.departmentMatch ? 2 : 0) + (right.sectionMatch ? 1 : 0);
      if (rankLeft !== rankRight) return rankRight - rankLeft;
      return String(left.Name || '').localeCompare(String(right.Name || ''), 'ar');
    });

    return res.json({ items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر تحميل اقتراحات أسماء الموظفين.' });
  }
});

router.get('/table/:table', async (req, res) => {
  const table = req.params.table;
  if (!isValidDailyTable(table)) {
    return res.status(400).json({ message: 'اسم جدول غير صالح' });
  }

  const records = (await db.prepare(`SELECT * FROM ${table} ORDER BY date(REPLACE(Today, '/', '-')) DESC, Name ASC, ID DESC`).all());
  res.json(filterByDataScope(records, req.access));
});

router.get('/table/:table/:id', async (req, res) => {
  const table = req.params.table;
  const id = Number(req.params.id);
  if (!isValidDailyTable(table) || !id) {
    return res.status(400).json({ message: 'معرّف غير صالح أو جدول غير صالح' });
  }

  const record = (await db.prepare(`SELECT * FROM ${table} WHERE ID = ?`).get(id));
  return record && isWithinDataScope(record, req.access)
    ? res.json(record)
    : res.status(404).json({ message: 'السجل غير موجود' });
});

router.get('/search', async (req, res) => {
  try {
    const filters = [];
    const params = [];

    if (req.query.empId) {
      filters.push('EmpID = ?');
      params.push(req.query.empId);
    }

    if (req.query.name) {
      filters.push('Name LIKE ?');
      params.push(`%${String(req.query.name).trim()}%`);
    }

    if (req.query.status) {
      filters.push('Status = ?');
      params.push(req.query.status);
    }

    if (req.query.department) {
      filters.push(`(CASE WHEN TRIM(Department) = 'الإحصاء' THEN 'الاحصاء' ELSE TRIM(Department) END) = ?`);
      params.push(normalizeDepartment(req.query.department));
    }

    if (req.query.section) {
      filters.push('TRIM(Section) = ?');
      params.push(String(req.query.section).trim());
    }

    if (req.query.period) {
      filters.push('TRIM(Period) = ?');
      params.push(String(req.query.period).trim());
    }

    if (req.query.day) {
      filters.push('TRIM(Day) = ?');
      params.push(String(req.query.day).trim());
    }

    if (req.query.today) {
      filters.push(`date(REPLACE(Today, '/', '-')) = date(?)`);
      params.push(normalizeDateInput(req.query.today));
    }

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
    const sourceSql = `
      SELECT ID, EmpID, Day, Today, Name, Department, Section, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note FROM Daily1
      UNION ALL
      SELECT ID, EmpID, Day, Today, Name, Department, Section, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note FROM Daily2
      UNION ALL
      SELECT ID, EmpID, Day, Today, Name, Department, Section, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note FROM Daily3
      UNION ALL
      SELECT ID, EmpID, Day, Today, Name, Department, Section, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note FROM Daily4
    `;
    const sql = `
      SELECT ID, EmpID, Day, Today, Name, Department, Section, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note
      FROM (${sourceSql}) AS logs
      ${whereClause}
      ORDER BY date(REPLACE(Today, '/', '-')) DESC, Name ASC, ID DESC
      LIMIT 5000
    `;

    const records = (await db.prepare(sql).all(...params));
    res.json(filterByDataScope(records, req.access));
  } catch (error) {
    console.error(error);
    res.json([]);
  }
});

router.post('/generate', async (req, res) => {
  try {
    const today = normalizeDateInput(req.body.today);
    const department = normalizeDepartment(req.body.department);
    const requestedSection = String(req.body.section || '').trim();
    const period = String(req.body.period || '').trim();
    const employeeName = String(req.body.employeeName || '').trim();
    const userName = String(req.body.userName || 'system').trim() || 'system';

    if (!today || !department || !period) {
      return res.status(400).json({ message: 'التاريخ والقسم والفترة مطلوبة.' });
    }
    if (!isWithinDataScope({ Department: department, Section: requestedSection }, req.access)) {
      return res.status(403).json({ message: 'القسم أو النوبة خارج نطاق صلاحيات المستخدم.' });
    }

    const table = resolveDailyTableByDepartment(department);
    if (!table) {
      return res.status(400).json({ message: 'تعذر تحديد جدول اليومية لهذا القسم.' });
    }

    if (tableSections[table].length && requestedSection && !tableSections[table].includes(requestedSection)) {
      return res.status(400).json({ message: 'النوبة المختارة لا تتبع القسم المحدد.' });
    }

    const employeePool = employeeName
      ? (await findActiveEmployees())
      : (await findActiveEmployees(department, requestedSection));
    const employees = filterEmployeesByExactName(employeePool, employeeName);

    if (!employees.length) {
      return res.json({ added: 0, skipped: 0, message: employeeName ? 'الاسم غير موجود' : 'لا يوجد موظفون نشطون مطابقون للقسم/النوبة المحددة.' });
    }

    const defaults = periodTimes[period] || { inTime: '', outTime: '' };
    const todaySlash = toSlashDate(today);
    const day = String(req.body.day || getArabicDay(today)).trim();
    const insert = db.prepare(`
      INSERT INTO ${table} (EmpID, Day, Today, Name, Department, Section, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let added = 0;
    let skipped = 0;

    for (const employee of employees) {
      const empID = String(employee.EmpID || '').trim();
      const name = String(employee.Name || '').trim();
      const employeeSection = employeeName && requestedSection
        ? requestedSection
        : String(employee.Section || '').trim();

      if (!name) {
        skipped += 1;
        continue;
      }

      if ((await hasSameEmployeeInDaily(table, empID, name, today, period))) {
        skipped += 1;
        continue;
      }

      ensureDailyScanSectionDirectory(employeeSection);

      const leave = (await findLeaveForDate(empID, name, today));
      const course = leave ? null : (await findCourseForDate(empID, name, today));

      let status = 'حضور';
      let inTime = defaults.inTime;
      let outTime = defaults.outTime;
      let startDate = null;
      let endDate = null;
      let type = null;
      let note = '';

      if (leave) {
        status = 'اجازة';
        inTime = '';
        outTime = '';
        startDate = leave.Startdate || null;
        endDate = leave.Enddate || null;
        type = leave.Type || null;
        note = leave.Note || '';
      } else if (course) {
        status = 'دورة';
        inTime = '';
        outTime = '';
        startDate = course.Startdate || null;
        endDate = course.Enddate || null;
        type = course.CourseName || 'دورة';
        note = course.Note || '';
      }

      (await insert.run(
        empID,
        day,
        todaySlash,
        name,
        department,
        employeeSection,
        status,
        period,
        inTime,
        outTime,
        startDate,
        endDate,
        type,
        note
      ));

      added += 1;
    }

    (await logSystem({ userName, action: 'Add', page: table, details: employeeName ? `Generated single daily record for ${employeeName} on ${todaySlash}` : `Generated daily records (${added}) for ${todaySlash}` }));
    res.json({ added, skipped, message: employeeName ? (added ? `تمت إضافة بيانات اليومية للموظف ${employeeName}.` : `الموظف ${employeeName} موجود مسبقاً في اليومية.`) : `تمت إضافة ${added} سجل وتخطي ${skipped} سجل مكرر.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر إنشاء يوميات الموظفين.' });
  }
});

router.post('/table/:table', async (req, res) => {
  const table = req.params.table;
  if (!isValidDailyTable(table)) {
    return res.status(400).json({ message: 'اسم جدول غير صالح' });
  }

  const payload = applyStatusRules(req.body);
  const day = String(payload.Day || '').trim() || getArabicDay(payload.Today);
  const todayValue = toSlashDate(payload.Today);
  const period = String(payload.Period || '').trim();

  if (!todayValue || !payload.Department || !period || !payload.Name) {
    return res.status(400).json({ message: 'البيانات الأساسية غير مكتملة لإضافة سجل اليومية.' });
  }
  if (!statusCatalog.statuses.includes(payload.Status)) {
    return res.status(400).json({ message: 'الحالة المختارة غير معتمدة في اليومية.' });
  }
  if (!isWithinDataScope(payload, req.access)) {
    return res.status(403).json({ message: 'لا تملك صلاحية إضافة سجل خارج القسم أو النوبة المسموحة.' });
  }

  if ((await hasSameEmployeeInDaily(table, payload.EmpID, payload.Name, normalizeDateInput(todayValue), period))) {
    return res.status(409).json({ message: 'لا يمكن تكرار نفس الموظف في اليومية الواحدة.' });
  }

  payload.Day = day;
  payload.Today = todayValue;

  const permissionLimitError = (await validateMonthlyPermissionLimit(payload));
  if (permissionLimitError) {
    return res.status(400).json({ message: permissionLimitError });
  }

  const statement = buildInsertStatement(table, payload);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كاملة' });
  }

  ensureDailyScanSectionDirectory(payload.Section);
  const result = (await db.prepare(statement.sql).run(statement.values));
  (await logSystem({ userName: req.body.userName || 'system', action: 'Add', page: table, details: `Added daily record ID=${result.lastInsertRowid}` }));
  res.json({ id: result.lastInsertRowid });
});

router.put('/bulk', async (req, res) => {
  try {
    const sourceToday = normalizeDateInput(req.body.today);
    const sourceDepartment = normalizeDepartment(req.body.department);
    const sourceSection = String(req.body.section || '').trim();
    const sourcePeriod = String(req.body.period || '').trim();
    const nextToday = normalizeDateInput(req.body.nextToday) || sourceToday;
    const nextPeriod = String(req.body.nextPeriod || '').trim() || sourcePeriod;

    if (!sourceToday || !sourceDepartment || !sourceSection || !sourcePeriod) {
      return res.status(400).json({ message: 'اختر التاريخ والقسم والنوبة والفترة لليومية المطلوب تعديلها.' });
    }
    if (!isWithinDataScope({ Department: sourceDepartment, Section: sourceSection }, req.access)) {
      return res.status(403).json({ message: 'اليومية المحددة خارج نطاق صلاحيات المستخدم.' });
    }

    if (!nextToday || !periods.includes(nextPeriod)) {
      return res.status(400).json({ message: 'أدخل تاريخًا صحيحًا أو اختر فترة صحيحة للتعديل.' });
    }

    const table = resolveDailyTableByDepartment(sourceDepartment);
    if (!table) {
      return res.status(400).json({ message: 'تعذر تحديد جدول اليومية للقسم المحدد.' });
    }

    const sourceRows = (await db.prepare(`
      SELECT * FROM ${table}
      WHERE date(REPLACE(Today, '/', '-')) = date(?)
        AND TRIM(Department) = ?
        AND TRIM(Section) = ?
        AND TRIM(Period) = ?
      ORDER BY ID ASC
    `).all(sourceToday, sourceDepartment, sourceSection, sourcePeriod));

    if (!sourceRows.length) {
      return res.status(404).json({ message: 'لا توجد سجلات مطابقة لليومية المحددة لتعديلها.' });
    }

    const targetToday = toSlashDate(nextToday);
    const targetDay = getArabicDay(nextToday);
    const findDuplicate = db.prepare(`
      SELECT ID FROM ${table}
      WHERE date(REPLACE(Today, '/', '-')) = date(?)
        AND TRIM(Period) = ?
        AND ID <> ?
        AND ((EmpID IS NOT NULL AND CAST(EmpID AS TEXT) = ?) OR TRIM(Name) = ?)
      LIMIT 1
    `);

    for (const row of sourceRows) {
      const duplicate = (await findDuplicate.get(nextToday, nextPeriod, row.ID, String(row.EmpID || '').trim(), String(row.Name || '').trim()));
      if (duplicate) {
        return res.status(409).json({ message: `لا يمكن تعديل اليومية لأن الموظف ${row.Name || ''} موجود مسبقًا في التاريخ والفترة الجديدة.` });
      }

      const permissionLimitError = (await validateMonthlyPermissionLimit({ ...row, Today: targetToday, Day: targetDay, Period: nextPeriod }, table, row.ID));
      if (permissionLimitError) {
        return res.status(400).json({ message: `${permissionLimitError} الموظف: ${row.Name || ''}.` });
      }
    }

    const update = db.prepare(`UPDATE ${table} SET Today = ?, Day = ?, Period = ? WHERE ID = ?`);
    await db.transaction(async () => {
      for (const row of sourceRows) {
        await update.run(targetToday, targetDay, nextPeriod, row.ID);
      }
    })();

    (await logSystem({ userName: req.body.userName || 'system', action: 'Update', page: table, details: `Bulk updated ${sourceRows.length} daily records to ${targetToday} / ${nextPeriod}` }));
    return res.json({ changes: sourceRows.length, message: `تم تعديل ${sourceRows.length} سجلًا في اليومية بنجاح.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر تعديل تاريخ أو فترة اليومية. تحقق من اتصال قاعدة البيانات ثم حاول مرة أخرى.' });
  }
});

router.put('/table/:table/:id', async (req, res) => {
  const table = req.params.table;
  const id = Number(req.params.id);
  if (!isValidDailyTable(table) || !id) {
    return res.status(400).json({ message: 'معرّف غير صالح أو جدول غير صالح' });
  }

  let payload = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(payload, 'Today')) {
    payload.Today = toSlashDate(payload.Today);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'Day') && !String(payload.Day || '').trim() && payload.Today) {
    payload.Day = getArabicDay(payload.Today);
  }

  const current = (await db.prepare(`SELECT * FROM ${table} WHERE ID = ?`).get(id));
  if (!current || !isWithinDataScope(current, req.access)) {
    return res.status(404).json({ message: 'السجل غير موجود للتعديل' });
  }
  if (!isWithinDataScope({ ...current, ...payload }, req.access)) {
    return res.status(403).json({ message: 'لا تملك صلاحية نقل السجل خارج القسم أو النوبة المسموحة.' });
  }

  payload = applyStatusRules({ ...current, ...payload });
  const currentStatus = statusCatalog.normalizeStatus(current.Status);
  if (!statusCatalog.statuses.includes(payload.Status) && payload.Status !== currentStatus) {
    return res.status(400).json({ message: 'الحالة المختارة غير معتمدة في اليومية.' });
  }

  const permissionLimitError = (await validateMonthlyPermissionLimit({ ...current, ...payload }, table, id));
  if (permissionLimitError) {
    return res.status(400).json({ message: permissionLimitError });
  }

  const statement = buildUpdateStatement(table, payload, id);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كاملة' });
  }

  const userName = req.body.userName || 'system';
  const result = (await db.prepare(statement.sql).run(statement.values));
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للتعديل' });
  }

  (await logSystem({ userName, action: 'Update', page: table, details: `Updated daily record ID=${id}` }));
  res.json({ changes: result.changes });
});

router.delete('/table/:table/:id', async (req, res) => {
  const table = req.params.table;
  const id = Number(req.params.id);
  if (!isValidDailyTable(table) || !id) {
    return res.status(400).json({ message: 'معرّف غير صالح أو جدول غير صالح' });
  }

  const current = (await db.prepare(`SELECT * FROM ${table} WHERE ID = ?`).get(id));
  if (!current || !isWithinDataScope(current, req.access)) {
    return res.status(404).json({ message: 'السجل غير موجود للحذف' });
  }

  const result = (await db.prepare(`DELETE FROM ${table} WHERE ID = ?`).run(id));
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للحذف' });
  }

  (await logSystem({ userName: req.body.userName || 'system', action: 'Delete', page: table, details: `Deleted daily record ID=${id}` }));
  res.json({ changes: result.changes });
});

module.exports = router;
