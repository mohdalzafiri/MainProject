const express = require('express');
const { db } = require('../database');
const router = express.Router();

function normalizeDateInput(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\//g, '-');
}

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

function translateAction(action) {
  const key = String(action || '').trim().toLowerCase();
  const map = {
    add: 'إضافة',
    update: 'تعديل',
    delete: 'حذف',
    view: 'عرض',
    print: 'طباعة',
    search: 'بحث',
    'login success': 'تسجيل دخول ناجح',
    'login failed': 'فشل تسجيل الدخول',
    'login error': 'خطأ تسجيل الدخول'
  };

  return map[key] || String(action || '');
}

function translateTarget(target) {
  const key = String(target || '').trim();
  const normalized = key.toLowerCase();

  const map = {
    main: 'الموظفين',
    holiday: 'الإجازات',
    course: 'الدورات',
    transfer: 'التنقلات',
    login: 'تسجيل الدخول',
    settings: 'الإعدادات',
    dashboard: 'الرئيسية',
    systemlog: 'سجل النظام',
    administrativeforms: 'النماذج الإدارية',
    api: 'واجهة النظام'
  };

  if (/^daily[1-4]$/i.test(key) || /^dailyall(_p)?$/i.test(key)) {
    return 'اليوميات';
  }

  return map[normalized] || key;
}

function translateDetails(details) {
  const text = String(details || '').trim();
  if (!text) return text;

  const directMap = {
    'User logged in': 'تم تسجيل دخول المستخدم',
    'User not found': 'المستخدم غير موجود',
    'Invalid password': 'كلمة المرور غير صحيحة',
    'Inactive user': 'المستخدم غير نشط',
    'Missing username or password': 'اسم المستخدم أو كلمة المرور مفقود'
  };

  if (directMap[text]) {
    return directMap[text];
  }

  const entityMap = [
    { pattern: /department-section/gi, value: 'القسم/النوبة' },
    { pattern: /admin password/gi, value: 'كلمة سر المدير' },
    { pattern: /login user/gi, value: 'مستخدم النظام' },
    { pattern: /daily record/gi, value: 'سجل يومي' },
    { pattern: /employee/gi, value: 'موظف' },
    { pattern: /holiday/gi, value: 'إجازة' },
    { pattern: /course/gi, value: 'دورة' },
    { pattern: /transfer/gi, value: 'تنقل' }
  ];

  let translated = text;
  entityMap.forEach((item) => {
    translated = translated.replace(item.pattern, item.value);
  });

  translated = translated
    .replace(/^Added\s+/i, 'تمت إضافة ')
    .replace(/^Updated\s+/i, 'تم تعديل ')
    .replace(/^Deleted\s+/i, 'تم حذف ');

  return translated;
}

function localizeRecord(record) {
  if (!record) return record;

  return {
    ...record,
    Action: translateAction(record.Action),
    Target: translateTarget(record.Target),
    Details: translateDetails(record.Details)
  };
}

router.get('/', (req, res) => {
  const filters = [];
  const params = [];

  if (req.query.userName) {
    filters.push('UserName = ?');
    params.push(req.query.userName);
  }
  if (req.query.action) {
    filters.push('Action = ?');
    params.push(req.query.action);
  }
  if (req.query.target) {
    filters.push('Target = ?');
    params.push(req.query.target);
  }

  const fromDate = normalizeDateInput(req.query.fromDate);
  const toDate = normalizeDateInput(req.query.toDate);

  if (fromDate) {
    filters.push('date(Timestamp) >= date(?)');
    params.push(fromDate);
  }

  if (toDate) {
    filters.push('date(Timestamp) <= date(?)');
    params.push(toDate);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const sql = `SELECT * FROM SystemLog ${whereClause} ORDER BY Timestamp DESC`;
  const records = db.prepare(sql).all(...params).map(replaceEmployeeIdWithName).map(localizeRecord);
  res.json(records);
});

module.exports = router;
