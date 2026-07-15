const express = require('express');
const path = require('path');
const { db, dailyTables, logSystem, getCurrentTimestamp } = require('../database');
const { templatesRoot } = require('../services/wordTemplateService');

const router = express.Router();

function isAdminUser(req) {
  const role = String(req.user?.role || '').trim().toLowerCase();
  return role === 'admin';
}

function denyIfNotAdmin(req, res) {
  if (!isAdminUser(req)) {
    res.status(403).json({ message: 'غير مصرح لك بالوصول إلى الإعدادات.' });
    return true;
  }
  return false;
}

function normalize(value) {
  return String(value || '').trim();
}

function deriveTemplateNameFromFileName(fileName) {
  const raw = normalize(fileName);
  if (!raw) return '';
  return raw.replace(/\.[^.]+$/, '').trim();
}

function tableExists(name) {
  const row = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(name);
  return Boolean(row);
}

router.get('/department-sections', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  try {
    const rows = db.prepare(`
      SELECT ID, Department, Section, SubSection, SortOrder, IsActive, CreatedAt, UpdatedAt
      FROM DepartmentSectionLookup
      ORDER BY SortOrder ASC, ID ASC
    `).all();

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل بيانات الأقسام والنوبات.' });
  }
});

router.post('/department-sections', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  const department = normalize(req.body.Department);
  const section = normalize(req.body.Section);
  const subSection = normalize(req.body.SubSection);
  const isActive = Number(req.body.IsActive) === 0 ? 0 : 1;

  if (!department) {
    return res.status(400).json({ message: 'اسم القسم مطلوب.' });
  }

  if (!section) {
    return res.status(400).json({ message: 'اسم النوبة مطلوب.' });
  }

  const duplicate = db.prepare(`
    SELECT ID FROM DepartmentSectionLookup
    WHERE Department = ? AND Section = ? AND IFNULL(SubSection, '') = ?
    LIMIT 1
  `).get(department, section, subSection);

  if (duplicate) {
    return res.status(409).json({ message: 'هذا القسم مع هذه النوبة موجود مسبقًا.' });
  }

  try {
    const timestamp = getCurrentTimestamp();
    const nextSortOrder = db.prepare('SELECT COALESCE(MAX(SortOrder), 0) + 1 AS value FROM DepartmentSectionLookup').get().value;
    const result = db.prepare(`
      INSERT INTO DepartmentSectionLookup (Department, Section, SubSection, SortOrder, IsActive, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(department, section, subSection, nextSortOrder, isActive, timestamp, timestamp);

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Add',
      page: 'Settings',
      details: `Added department-section ID=${result.lastInsertRowid}`
    });

    res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر إضافة القسم والنوبة.' });
  }
});

router.put('/department-sections/:id', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف السجل غير صالح.' });
  }

  const department = normalize(req.body.Department);
  const section = normalize(req.body.Section);
  const subSection = normalize(req.body.SubSection);
  const isActive = Number(req.body.IsActive) === 0 ? 0 : 1;

  if (!department) {
    return res.status(400).json({ message: 'اسم القسم مطلوب.' });
  }

  if (!section) {
    return res.status(400).json({ message: 'اسم النوبة مطلوب.' });
  }

  const duplicate = db.prepare(`
    SELECT ID FROM DepartmentSectionLookup
    WHERE Department = ? AND Section = ? AND IFNULL(SubSection, '') = ? AND ID <> ?
    LIMIT 1
  `).get(department, section, subSection, id);

  if (duplicate) {
    return res.status(409).json({ message: 'يوجد سجل آخر بنفس القسم والنوبة.' });
  }

  try {
    const timestamp = getCurrentTimestamp();
    const result = db.prepare(`
      UPDATE DepartmentSectionLookup
      SET Department = ?, Section = ?, SubSection = ?, IsActive = ?, UpdatedAt = ?
      WHERE ID = ?
    `).run(department, section, subSection, isActive, timestamp, id);

    if (result.changes === 0) {
      return res.status(404).json({ message: 'السجل غير موجود للتعديل.' });
    }

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Update',
      page: 'Settings',
      details: `Updated department-section ID=${id}`
    });

    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تعديل القسم والنوبة.' });
  }
});

router.delete('/department-sections/:id', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف السجل غير صالح.' });
  }

  const target = db.prepare('SELECT ID, Department, Section, SubSection FROM DepartmentSectionLookup WHERE ID = ? LIMIT 1').get(id);
  if (!target) {
    return res.status(404).json({ message: 'السجل غير موجود للحذف.' });
  }

  const linkedTableChecks = [
    {
      table: 'Main',
      label: 'الموظفين',
      sql: `SELECT ID FROM Main WHERE TRIM(Department) = ? AND TRIM(Section) = ? AND IFNULL(TRIM(SubSection), '') = ? LIMIT 1`
    },
    {
      table: 'Holiday',
      label: 'الإجازات',
      sql: `SELECT ID FROM Holiday WHERE TRIM(Department) = ? AND TRIM(Section) = ? LIMIT 1`
    },
    {
      table: 'Course',
      label: 'الدورات',
      sql: `SELECT ID FROM Course WHERE TRIM(Department) = ? AND TRIM(Section) = ? LIMIT 1`
    },
    {
      table: 'Transfer',
      label: 'التنقلات',
      sql: `SELECT ID FROM Transfer WHERE (TRIM(Department) = ? AND TRIM(Section) = ? AND IFNULL(TRIM(SubSection), '') = ?) OR (TRIM(Department1) = ? AND TRIM(Section1) = ? AND IFNULL(TRIM(SubSection1), '') = ?) LIMIT 1`,
      args: [target.Department, target.Section, target.SubSection || '', target.Department, target.Section, target.SubSection || '']
    }
  ];

  dailyTables.forEach((table) => {
    linkedTableChecks.push({
      table,
      label: 'اليوميات',
      sql: `SELECT ID FROM ${table} WHERE TRIM(Department) = ? AND TRIM(Section) = ? AND IFNULL(TRIM(SubSection), '') = ? LIMIT 1`
    });
  });

  for (const check of linkedTableChecks) {
    if (!tableExists(check.table)) {
      continue;
    }

    const linkedRow = db.prepare(check.sql).get(...(check.args || [target.Department, target.Section, target.SubSection || '']));
    if (linkedRow) {
      return res.status(409).json({ message: `لا يمكن حذف هذا السجل لوجود بيانات مرتبطة به في ${check.label}.` });
    }
  }

  try {
    const result = db.prepare('DELETE FROM DepartmentSectionLookup WHERE ID = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'السجل غير موجود للحذف.' });
    }

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Delete',
      page: 'Settings',
      details: `Deleted department-section ID=${id}`
    });

    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر حذف القسم والنوبة.' });
  }
});

router.get('/employees-active', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  try {
    const rows = db.prepare(`
      SELECT ID, Name, Department, Section
      FROM Main
      WHERE TRIM(Status) = 'نشط' AND TRIM(Name) <> ''
      ORDER BY Name ASC
    `).all();

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل قائمة الموظفين النشطين.' });
  }
});

router.get('/users', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  try {
    const rows = db.prepare(`
      SELECT ID, Username, Password, Permission, Name, Department, Section, IsActive, CreatedAt, UpdatedAt, LastLogin
      FROM Login
      ORDER BY ID ASC
    `).all();

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل بيانات المستخدمين.' });
  }
});

router.post('/users', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  const payload = {
    Username: normalize(req.body.Username),
    Password: normalize(req.body.Password),
    Permission: normalize(req.body.Permission),
    Name: normalize(req.body.Name),
    Department: normalize(req.body.Department),
    Section: normalize(req.body.Section),
    IsActive: Number(req.body.IsActive) === 0 ? 0 : 1
  };

  if (!payload.Username) {
    return res.status(400).json({ message: 'اسم المستخدم مطلوب.' });
  }

  if (!payload.Password) {
    return res.status(400).json({ message: 'كلمة السر مطلوبة.' });
  }

  if (!payload.Permission) {
    return res.status(400).json({ message: 'الصلاحية مطلوبة.' });
  }

  const existingUser = db.prepare('SELECT ID FROM Login WHERE Username = ? COLLATE NOCASE LIMIT 1').get(payload.Username);
  if (existingUser) {
    return res.status(409).json({ message: 'اسم المستخدم مستخدم مسبقًا.' });
  }

  const timestamp = getCurrentTimestamp();

  try {
    const result = db.prepare(`
      INSERT INTO Login (Username, Password, Permission, Department, Section, Name, IsActive, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.Username, payload.Password, payload.Permission, payload.Department, payload.Section, payload.Name, payload.IsActive, timestamp, timestamp);

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Add',
      page: 'Settings',
      details: `Added login user ID=${result.lastInsertRowid}`
    });

    return res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر إضافة المستخدم.' });
  }
});

router.put('/users/:id', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف المستخدم غير صالح.' });
  }

  const targetUser = db.prepare(`
    SELECT ID, Username, Password, Permission, Name, Department, Section, IsActive
    FROM Login
    WHERE ID = ?
    LIMIT 1
  `).get(id);

  if (!targetUser) {
    return res.status(404).json({ message: 'المستخدم غير موجود للتعديل.' });
  }

  const isPrimaryAdmin = String(targetUser.Username || '').trim().toLowerCase() === 'admin';

  if (isPrimaryAdmin) {
    const passwordOnly = normalize(req.body.Password);
    if (!passwordOnly) {
      return res.status(400).json({ message: 'لا يمكن تعديل حساب admin إلا كلمة السر.' });
    }

    const timestamp = getCurrentTimestamp();

    try {
      const result = db.prepare(`
        UPDATE Login
        SET Password = ?, UpdatedAt = ?
        WHERE ID = ?
      `).run(passwordOnly, timestamp, id);

      logSystem({
        userName: req.user?.username || 'system',
        role: req.user?.role || '',
        action: 'Update',
        page: 'Settings',
        details: `Updated admin password ID=${id}`
      });

      return res.json({ changes: result.changes });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'تعذر تعديل كلمة سر admin.' });
    }
  }

  const payload = {
    Username: normalize(req.body.Username),
    Password: normalize(req.body.Password),
    Permission: normalize(req.body.Permission),
    Name: normalize(req.body.Name),
    Department: normalize(req.body.Department),
    Section: normalize(req.body.Section),
    IsActive: Number(req.body.IsActive) === 0 ? 0 : 1
  };

  if (!payload.Username) {
    return res.status(400).json({ message: 'اسم المستخدم مطلوب.' });
  }

  if (!payload.Password) {
    return res.status(400).json({ message: 'كلمة السر مطلوبة.' });
  }

  if (!payload.Permission) {
    return res.status(400).json({ message: 'الصلاحية مطلوبة.' });
  }

  const existingUser = db.prepare('SELECT ID FROM Login WHERE Username = ? COLLATE NOCASE AND ID <> ? LIMIT 1').get(payload.Username, id);
  if (existingUser) {
    return res.status(409).json({ message: 'اسم المستخدم مستخدم مسبقًا من حساب آخر.' });
  }

  const timestamp = getCurrentTimestamp();

  try {
    const result = db.prepare(`
      UPDATE Login
      SET Username = ?, Password = ?, Permission = ?, Department = ?, Section = ?, Name = ?, IsActive = ?, UpdatedAt = ?
      WHERE ID = ?
    `).run(payload.Username, payload.Password, payload.Permission, payload.Department, payload.Section, payload.Name, payload.IsActive, timestamp, id);

    if (result.changes === 0) {
      return res.status(404).json({ message: 'المستخدم غير موجود للتعديل.' });
    }

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Update',
      page: 'Settings',
      details: `Updated login user ID=${id}`
    });

    return res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر تعديل المستخدم.' });
  }
});

router.delete('/users/:id', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف المستخدم غير صالح.' });
  }

  const target = db.prepare('SELECT ID, Username FROM Login WHERE ID = ? LIMIT 1').get(id);
  if (!target) {
    return res.status(404).json({ message: 'المستخدم غير موجود للحذف.' });
  }

  if (String(target.Username || '').trim().toLowerCase() === 'admin') {
    return res.status(400).json({ message: 'لا يمكن حذف حساب admin الرئيسي.' });
  }

  try {
    const result = db.prepare('DELETE FROM Login WHERE ID = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'المستخدم غير موجود للحذف.' });
    }

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Delete',
      page: 'Settings',
      details: `Deleted login user ID=${id}`
    });

    return res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر حذف المستخدم.' });
  }
});

router.get('/administrative-templates', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  try {
    const rows = db.prepare(`
      SELECT ID, TemplateName, TemplateFileName, Coordinates, CreatedAt, UpdatedAt
      FROM AdministrativeTemplateConfigs
      ORDER BY TemplateName ASC
    `).all();

    const payload = rows.map((row) => {
      const templateFileName = normalize(row.TemplateFileName);
      const templateBaseName = path.basename(templateFileName);
      const templateFilePath = templateBaseName ? path.join(templatesRoot, templateBaseName) : '';

      return {
        ...row,
        TemplateFilePath: templateFilePath
      };
    });

    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر تحميل إعدادات النماذج الإدارية.' });
  }
});

router.post('/administrative-templates', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  const templateFileName = normalize(req.body.TemplateFileName);
  const templateName = normalize(req.body.TemplateName) || deriveTemplateNameFromFileName(templateFileName);
  const coordinates = normalize(req.body.Coordinates);

  if (!templateName) {
    return res.status(400).json({ message: 'اسم النموذج مطلوب أو ارفع ملفًا باسم صالح.' });
  }

  if (!templateFileName) {
    return res.status(400).json({ message: 'رابط/ملف النموذج مطلوب.' });
  }

  const exists = db.prepare('SELECT ID FROM AdministrativeTemplateConfigs WHERE TemplateName = ? COLLATE NOCASE LIMIT 1').get(templateName);
  if (exists) {
    return res.status(409).json({ message: 'اسم النموذج موجود مسبقاً.' });
  }

  try {
    const timestamp = getCurrentTimestamp();
    const result = db.prepare(`
      INSERT INTO AdministrativeTemplateConfigs (TemplateName, TemplateFileName, Coordinates, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(templateName, templateFileName, coordinates, timestamp, timestamp);

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Add',
      page: 'Settings',
      details: `Added administrative template config ID=${result.lastInsertRowid}`
    });

    return res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر إضافة إعداد النموذج.' });
  }
});

router.put('/administrative-templates/:id', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف النموذج غير صالح.' });
  }

  const templateFileName = normalize(req.body.TemplateFileName);
  const templateName = normalize(req.body.TemplateName) || deriveTemplateNameFromFileName(templateFileName);
  const coordinates = normalize(req.body.Coordinates);

  if (!templateName) {
    return res.status(400).json({ message: 'اسم النموذج مطلوب أو ارفع ملفًا باسم صالح.' });
  }

  if (!templateFileName) {
    return res.status(400).json({ message: 'رابط/ملف النموذج مطلوب.' });
  }

  const exists = db.prepare('SELECT ID FROM AdministrativeTemplateConfigs WHERE TemplateName = ? COLLATE NOCASE AND ID <> ? LIMIT 1').get(templateName, id);
  if (exists) {
    return res.status(409).json({ message: 'اسم النموذج مستخدم من سجل آخر.' });
  }

  try {
    const timestamp = getCurrentTimestamp();
    const result = db.prepare(`
      UPDATE AdministrativeTemplateConfigs
      SET TemplateName = ?, TemplateFileName = ?, Coordinates = ?, UpdatedAt = ?
      WHERE ID = ?
    `).run(templateName, templateFileName, coordinates, timestamp, id);

    if (result.changes === 0) {
      return res.status(404).json({ message: 'السجل غير موجود للتعديل.' });
    }

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Update',
      page: 'Settings',
      details: `Updated administrative template config ID=${id}`
    });

    return res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر تعديل إعداد النموذج.' });
  }
});

router.delete('/administrative-templates/:id', (req, res) => {
  if (denyIfNotAdmin(req, res)) return;

  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: 'معرّف النموذج غير صالح.' });
  }

  try {
    const result = db.prepare('DELETE FROM AdministrativeTemplateConfigs WHERE ID = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ message: 'السجل غير موجود للحذف.' });
    }

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Delete',
      page: 'Settings',
      details: `Deleted administrative template config ID=${id}`
    });

    return res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر حذف إعداد النموذج.' });
  }
});

module.exports = router;
