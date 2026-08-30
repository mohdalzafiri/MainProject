const express = require('express');
const { db, dailyTables, isValidDailyTable, logSystem } = require('../database');

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

function getTimeMinutes(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

function getPermissionMinutes(inTime, outTime) {
  const start = getTimeMinutes(inTime);
  const end = getTimeMinutes(outTime);
  if (start === null || end === null || start === end) return 0;
  return end > start ? end - start : (24 * 60) - start + end;
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

function validateMonthlyPermissionLimit(record, excludedTable = '', excludedId = 0) {
  if (String(record.Status || '').trim() !== 'استئذان') return '';

  const today = normalizeDateInput(record.Today);
  const name = String(record.Name || '').trim();
  const empId = String(record.EmpID || '').trim();
  const bounds = getMonthBounds(today);
  if (!today || !bounds || (!empId && !name)) return '';

  const records = db.prepare(`
    SELECT SourceTable, ID, InTime, OutTime
    FROM (${getPermissionSourceQuery()}) AS DailyPermissions
    WHERE TRIM(Status) = 'استئذان'
      AND date(REPLACE(Today, '/', '-')) BETWEEN date(?) AND date(?)
      AND (
        (EmpID IS NOT NULL AND CAST(EmpID AS TEXT) = ?)
        OR TRIM(Name) = ?
      )
  `).all(bounds.from, bounds.to, empId, name).filter((item) =>
    String(item.SourceTable || '') !== excludedTable || Number(item.ID) !== Number(excludedId)
  );

  const totalCount = records.length + 1;
  const totalMinutes = records.reduce(
    (sum, item) => sum + getPermissionMinutes(item.InTime, item.OutTime),
    getPermissionMinutes(record.InTime, record.OutTime)
  );

  if (totalCount > 4) {
    return `لا يمكن تسجيل الاستئذان: الحد الشهري هو 4 استئذانات، والمستخدم حاليًا ${totalCount} استئذانات.`;
  }

  if (totalMinutes > (12 * 60)) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `لا يمكن تسجيل الاستئذان: إجمالي ساعات الاستئذان للشهر أصبح ${hours}:${String(minutes).padStart(2, '0')} ويتجاوز الحد المسموح 12:00 ساعة.`;
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

function getLookupDepartments() {
  const departments = db.prepare(`
    SELECT DISTINCT TRIM(Department) AS value
    FROM DepartmentSectionLookup
    WHERE IsActive = 1 AND TRIM(Department) <> ''
    ORDER BY SortOrder ASC, ID ASC
  `).all().map((row) => normalizeDepartment(row.value));

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

function findActiveEmployees(department, section = '') {
  const normalizedDepartment = normalizeDepartment(department);
  const normalizedSection = String(section || '').trim();

  if (!normalizedDepartment) {
    return db.prepare(`
      SELECT ID AS EmpID, Name, Department, Section
      FROM Main
      WHERE TRIM(Status) = 'نشط'
      ORDER BY Name ASC
    `).all();
  }

  const baseSql = `
    SELECT ID AS EmpID, Name, Department, Section
    FROM Main
    WHERE TRIM(Status) = 'نشط'
      AND (
        CASE WHEN TRIM(Department) = 'الإحصاء' THEN 'الاحصاء' ELSE TRIM(Department) END
      ) = ?
  `;

  if (!normalizedSection) {
    return db.prepare(`${baseSql} ORDER BY Name ASC`).all(normalizedDepartment);
  }

  return db.prepare(`${baseSql} AND TRIM(Section) = ? ORDER BY Name ASC`).all(normalizedDepartment, normalizedSection);
}

function filterEmployeesByExactName(employees, employeeName) {
  const target = String(employeeName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!target) return employees;
  return employees.filter((employee) => String(employee.Name || '').trim().toLowerCase().replace(/\s+/g, ' ') === target);
}

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findLeaveForDate(empID, name, dateValue) {
  return db.prepare(`
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
  `).get(empID, String(name || '').trim(), dateValue, dateValue);
}

function findCourseForDate(empID, name, dateValue) {
  return db.prepare(`
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
  `).get(empID, String(name || '').trim(), dateValue, dateValue);
}

function hasSameEmployeeInDaily(table, empID, name, dateValue, period) {
  const row = db.prepare(`
    SELECT ID
    FROM ${table}
    WHERE date(REPLACE(Today, '/', '-')) = date(?)
      AND TRIM(Period) = ?
      AND (
        (EmpID IS NOT NULL AND CAST(EmpID AS TEXT) = CAST(? AS TEXT))
        OR TRIM(Name) = ?
      )
    LIMIT 1
  `).get(dateValue, String(period || '').trim(), empID, String(name || '').trim());

  return Boolean(row);
}

router.get('/', (req, res) => {
  const records = db.prepare(`
    SELECT ID, EmpID, Day, Today, Name, Department, Section, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note
    FROM DailyAll
    ORDER BY date(REPLACE(Today, '/', '-')) DESC, Name ASC, ID DESC
    LIMIT 1000
  `).all();
  res.json(records);
});

router.get('/tables', (req, res) => {
  res.json(dailyTables);
});

router.get('/filters', (req, res) => {
  try {
    res.json({
      departments: getLookupDepartments(),
      departmentSections: db.prepare(`
        SELECT Department, Section, SortOrder
        FROM DepartmentSectionLookup
        WHERE IsActive = 1
        ORDER BY SortOrder ASC, ID ASC
      `).all().map((row) => ({
        Department: normalizeDepartment(row.Department),
        Section: String(row.Section || '').trim(),
        SortOrder: row.SortOrder
      })),
      periods,
      statuses: ['حضور', 'تأخير', 'تأخير+عقوبة', 'استئذان', 'غياب', 'حضور بعد غياب', 'طبية', 'اجازة', 'دورة', 'تكليف', 'عرضي', 'انقطاع عن العمل']
    });
  } catch (error) {
    console.error(error);
    // Keep UI functional when database storage is temporarily unavailable.
    res.json({
      departments: [],
      departmentSections: [],
      periods,
      statuses: ['حضور', 'تأخير', 'تأخير+عقوبة', 'استئذان', 'غياب', 'حضور بعد غياب', 'طبية', 'اجازة', 'دورة', 'تكليف', 'عرضي', 'انقطاع عن العمل']
    });
  }
});

router.get('/recorded-sections', (req, res) => {
  try {
    const dateValue = normalizeDateInput(req.query.today);
    const department = normalizeDepartment(req.query.department);
    if (!dateValue || !department) {
      return res.json({ sections: [] });
    }

    const sections = db.prepare(`
      SELECT TRIM(Section) AS Section
      FROM DailyAll
      WHERE date(REPLACE(Today, '/', '-')) = date(?)
        AND (
          CASE WHEN TRIM(Department) = 'الإحصاء' THEN 'الاحصاء' ELSE TRIM(Department) END
        ) = ?
        AND TRIM(Section) <> ''
      GROUP BY TRIM(Section)
      ORDER BY MIN(ID) ASC
    `).all(dateValue, department).map((row) => String(row.Section || '').trim()).filter(Boolean);

    res.json({ sections });
  } catch (error) {
    console.error(error);
    res.json({ sections: [] });
  }
});

router.get('/employee-suggestions', (req, res) => {
  try {
    const keyword = String(req.query.q || '').trim();
    const department = normalizeDepartment(req.query.department);
    const section = String(req.query.section || '').trim();
    const today = normalizeDateInput(req.query.today);
    const period = String(req.query.period || '').trim();

    if (!keyword || !department || !section || !today) {
      return res.json({ items: [] });
    }

    const suggestions = db.prepare(`
      SELECT ID AS EmpID, Name, Department, Section
      FROM Main
      WHERE TRIM(Status) = 'نشط'
        AND (
          CASE WHEN TRIM(Department) = 'الإحصاء' THEN 'الاحصاء' ELSE TRIM(Department) END
        ) = ?
        AND TRIM(Section) = ?
        AND TRIM(Name) LIKE ?
      ORDER BY Name ASC
      LIMIT 60
    `).all(department, section, `%${keyword}%`);

    const table = resolveDailyTableByDepartment(department);
    const existingRows = table
      ? db.prepare(`
          SELECT EmpID, Name
          FROM ${table}
          WHERE date(REPLACE(Today, '/', '-')) = date(?)
            AND (
              CASE WHEN TRIM(Department) = 'الإحصاء' THEN 'الاحصاء' ELSE TRIM(Department) END
            ) = ?
            AND TRIM(Section) = ?
            ${period ? "AND TRIM(Period) = ?" : ''}
        `).all(...(period ? [today, department, section, period] : [today, department, section]))
      : [];

    const existingByEmpID = new Set(
      existingRows
        .map((row) => String(row.EmpID || '').trim())
        .filter(Boolean)
    );

    const existingByName = new Set(
      existingRows
        .map((row) => normalizeName(row.Name))
        .filter(Boolean)
    );

    const items = [];
    const seenNames = new Set();

    suggestions.forEach((row) => {
      const name = String(row.Name || '').trim();
      const empID = String(row.EmpID || '').trim();
      if (!name) return;

      const normalizedName = normalizeName(name);
      if (!normalizedName || seenNames.has(normalizedName)) return;
      seenNames.add(normalizedName);

      const inDaily = (empID && existingByEmpID.has(empID)) || existingByName.has(normalizedName);
      const departmentMatch = normalizeDepartment(row.Department) === department;
      const sectionMatch = !section || String(row.Section || '').trim() === section;
      items.push({
        EmpID: empID || null,
        Name: name,
        Department: normalizeDepartment(row.Department),
        Section: String(row.Section || '').trim(),
        inDaily,
        departmentMatch,
        sectionMatch
      });
    });

    items.sort((left, right) => {
      const rankLeft = (left.inDaily ? 4 : 0) + (left.departmentMatch ? 2 : 0) + (left.sectionMatch ? 1 : 0);
      const rankRight = (right.inDaily ? 4 : 0) + (right.departmentMatch ? 2 : 0) + (right.sectionMatch ? 1 : 0);
      if (rankLeft !== rankRight) return rankRight - rankLeft;
      return String(left.Name || '').localeCompare(String(right.Name || ''), 'ar');
    });

    return res.json({ items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر تحميل اقتراحات أسماء الموظفين.' });
  }
});

router.get('/table/:table', (req, res) => {
  const table = req.params.table;
  if (!isValidDailyTable(table)) {
    return res.status(400).json({ message: 'اسم جدول غير صالح' });
  }

  const records = db.prepare(`SELECT * FROM ${table} ORDER BY date(REPLACE(Today, '/', '-')) DESC, Name ASC, ID DESC`).all();
  res.json(records);
});

router.get('/table/:table/:id', (req, res) => {
  const table = req.params.table;
  const id = Number(req.params.id);
  if (!isValidDailyTable(table) || !id) {
    return res.status(400).json({ message: 'معرّف غير صالح أو جدول غير صالح' });
  }

  const record = db.prepare(`SELECT * FROM ${table} WHERE ID = ?`).get(id);
  return record ? res.json(record) : res.status(404).json({ message: 'السجل غير موجود' });
});

router.get('/search', (req, res) => {
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

    const records = db.prepare(sql).all(...params);
    res.json(records);
  } catch (error) {
    console.error(error);
    res.json([]);
  }
});

router.post('/generate', (req, res) => {
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

    const table = resolveDailyTableByDepartment(department);
    if (!table) {
      return res.status(400).json({ message: 'تعذر تحديد جدول اليومية لهذا القسم.' });
    }

    if (tableSections[table].length && requestedSection && !tableSections[table].includes(requestedSection)) {
      return res.status(400).json({ message: 'النوبة المختارة لا تتبع القسم المحدد.' });
    }

    const employees = filterEmployeesByExactName(findActiveEmployees(department, requestedSection), employeeName);

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

    employees.forEach((employee) => {
      const empID = String(employee.EmpID || '').trim();
      const name = String(employee.Name || '').trim();
      const employeeSection = employeeName && requestedSection
        ? requestedSection
        : String(employee.Section || '').trim();

      if (!name) {
        skipped += 1;
        return;
      }

      if (hasSameEmployeeInDaily(table, empID, name, today, period)) {
        skipped += 1;
        return;
      }

      const leave = findLeaveForDate(empID, name, today);
      const course = leave ? null : findCourseForDate(empID, name, today);

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

      insert.run(
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
      );

      added += 1;
    });

    logSystem({ userName, action: 'Add', page: table, details: employeeName ? `Generated single daily record for ${employeeName} on ${todaySlash}` : `Generated daily records (${added}) for ${todaySlash}` });
    res.json({ added, skipped, message: employeeName ? (added ? `تمت إضافة بيانات اليومية للموظف ${employeeName}.` : `الموظف ${employeeName} موجود مسبقاً في اليومية.`) : `تمت إضافة ${added} سجل وتخطي ${skipped} سجل مكرر.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر إنشاء يوميات الموظفين.' });
  }
});

router.post('/table/:table', (req, res) => {
  const table = req.params.table;
  if (!isValidDailyTable(table)) {
    return res.status(400).json({ message: 'اسم جدول غير صالح' });
  }

  const payload = { ...req.body };
  const day = String(payload.Day || '').trim() || getArabicDay(payload.Today);
  const todayValue = toSlashDate(payload.Today);
  const period = String(payload.Period || '').trim();

  if (!todayValue || !payload.Department || !period || !payload.Name) {
    return res.status(400).json({ message: 'البيانات الأساسية غير مكتملة لإضافة سجل اليومية.' });
  }

  if (hasSameEmployeeInDaily(table, payload.EmpID, payload.Name, normalizeDateInput(todayValue), period)) {
    return res.status(409).json({ message: 'لا يمكن تكرار نفس الموظف في اليومية الواحدة.' });
  }

  payload.Day = day;
  payload.Today = todayValue;

  const permissionLimitError = validateMonthlyPermissionLimit(payload);
  if (permissionLimitError) {
    return res.status(400).json({ message: permissionLimitError });
  }

  const statement = buildInsertStatement(table, payload);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كاملة' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  logSystem({ userName: req.body.userName || 'system', action: 'Add', page: table, details: `Added daily record ID=${result.lastInsertRowid}` });
  res.json({ id: result.lastInsertRowid });
});

router.put('/bulk', (req, res) => {
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

    if (!nextToday || !periods.includes(nextPeriod)) {
      return res.status(400).json({ message: 'أدخل تاريخًا صحيحًا أو اختر فترة صحيحة للتعديل.' });
    }

    const table = resolveDailyTableByDepartment(sourceDepartment);
    if (!table) {
      return res.status(400).json({ message: 'تعذر تحديد جدول اليومية للقسم المحدد.' });
    }

    const sourceRows = db.prepare(`
      SELECT * FROM ${table}
      WHERE date(REPLACE(Today, '/', '-')) = date(?)
        AND TRIM(Department) = ?
        AND TRIM(Section) = ?
        AND TRIM(Period) = ?
      ORDER BY ID ASC
    `).all(sourceToday, sourceDepartment, sourceSection, sourcePeriod);

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
      const duplicate = findDuplicate.get(nextToday, nextPeriod, row.ID, String(row.EmpID || '').trim(), String(row.Name || '').trim());
      if (duplicate) {
        return res.status(409).json({ message: `لا يمكن تعديل اليومية لأن الموظف ${row.Name || ''} موجود مسبقًا في التاريخ والفترة الجديدة.` });
      }

      const permissionLimitError = validateMonthlyPermissionLimit({ ...row, Today: targetToday, Day: targetDay, Period: nextPeriod }, table, row.ID);
      if (permissionLimitError) {
        return res.status(400).json({ message: `${permissionLimitError} الموظف: ${row.Name || ''}.` });
      }
    }

    const update = db.prepare(`UPDATE ${table} SET Today = ?, Day = ?, Period = ? WHERE ID = ?`);
    db.transaction(() => sourceRows.forEach((row) => update.run(targetToday, targetDay, nextPeriod, row.ID)))();

    logSystem({ userName: req.body.userName || 'system', action: 'Update', page: table, details: `Bulk updated ${sourceRows.length} daily records to ${targetToday} / ${nextPeriod}` });
    return res.json({ changes: sourceRows.length, message: `تم تعديل ${sourceRows.length} سجلًا في اليومية بنجاح.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر تعديل تاريخ أو فترة اليومية. تحقق من اتصال قاعدة البيانات ثم حاول مرة أخرى.' });
  }
});

router.put('/table/:table/:id', (req, res) => {
  const table = req.params.table;
  const id = Number(req.params.id);
  if (!isValidDailyTable(table) || !id) {
    return res.status(400).json({ message: 'معرّف غير صالح أو جدول غير صالح' });
  }

  const payload = { ...req.body };
  if (Object.prototype.hasOwnProperty.call(payload, 'Today')) {
    payload.Today = toSlashDate(payload.Today);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'Day') && !String(payload.Day || '').trim() && payload.Today) {
    payload.Day = getArabicDay(payload.Today);
  }

  const current = db.prepare(`SELECT * FROM ${table} WHERE ID = ?`).get(id);
  if (!current) {
    return res.status(404).json({ message: 'السجل غير موجود للتعديل' });
  }

  const permissionLimitError = validateMonthlyPermissionLimit({ ...current, ...payload }, table, id);
  if (permissionLimitError) {
    return res.status(400).json({ message: permissionLimitError });
  }

  const statement = buildUpdateStatement(table, payload, id);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كاملة' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للتعديل' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Update', page: table, details: `Updated daily record ID=${id}` });
  res.json({ changes: result.changes });
});

router.delete('/table/:table/:id', (req, res) => {
  const table = req.params.table;
  const id = Number(req.params.id);
  if (!isValidDailyTable(table) || !id) {
    return res.status(400).json({ message: 'معرّف غير صالح أو جدول غير صالح' });
  }

  const result = db.prepare(`DELETE FROM ${table} WHERE ID = ?`).run(id);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للحذف' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Delete', page: table, details: `Deleted daily record ID=${id}` });
  res.json({ changes: result.changes });
});

module.exports = router;

