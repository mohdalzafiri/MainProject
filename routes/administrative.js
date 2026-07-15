const express = require('express');
const { db, logSystem, getCurrentTimestamp } = require('../database');
const {
  formatDate,
  formatTimestamp,
  getTemplatePath,
  createOutputPaths,
  renderDocxFromTemplate,
  applyPreparationTemplateFormatting,
  convertDocxToPdf,
  readTemplateTags,
  renderDocxTemplateToHtml
} = require('../services/wordTemplateService');

const router = express.Router();
const columns = ['EmpID', 'Name', 'Department', 'Section', 'SubSection', 'Status', 'Department1', 'Section1', 'SubSection1', 'Enddate', 'Note', 'UserName'];

function ensureTransferTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS Transfer (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      EmpID INTEGER,
      Name TEXT,
      Department TEXT,
      Section TEXT,
      SubSection TEXT,
      Status TEXT,
      Department1 TEXT,
      Section1 TEXT,
      SubSection1 TEXT,
      Enddate TEXT,
      Note TEXT,
      UserName TEXT
    )
  `).run();

  const columnsInfo = db.prepare('PRAGMA table_info(Transfer)').all();
  if (!columnsInfo.some((column) => String(column.name || '').toLowerCase() === 'username')) {
    db.prepare('ALTER TABLE Transfer ADD COLUMN UserName TEXT').run();
  }
}

ensureTransferTable();

function normalize(value) {
  return String(value || '').trim();
}

function formatDisplayTime(value) {
  const raw = normalize(value);
  if (!raw) return '';

  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return '';

  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return '';
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatDateOnly(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

function getArabicDayName(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return days[date.getDay()] || '';
}

function buildEmployeeAliases(employees) {
  const list = Array.isArray(employees) ? employees : [];
  const aliases = {
    employee_count: list.length,
    names_text: list.map((item) => normalize(item.Name)).join('\n'),
    employee_names: list.map((item) => normalize(item.Name)).join('\n'),
    employees_names: list.map((item) => normalize(item.Name)).join('\n'),
    names_list: list.map((item) => normalize(item.Name)).join('\n'),
    names_numbered_text: list.map((item, index) => `${index + 1}. ${normalize(item.Name)}`).join('\n'),
    'اسماء_الموظفين': list.map((item) => normalize(item.Name)).join('\n'),
    'أسماء_الموظفين': list.map((item) => normalize(item.Name)).join('\n')
  };

  if (list.length > 0) {
    const firstName = normalize(list[0].Name);
    aliases.employee_name = firstName;
    aliases.name = firstName;
    aliases['اسم_الموظف'] = firstName;
  }

  list.forEach((item, index) => {
    const position = index + 1;
    const employeeName = normalize(item.Name);
    aliases[`employee_name_${position}`] = employeeName;
    aliases[`name_${position}`] = employeeName;
    aliases[`employee${position}`] = employeeName;
    aliases[`emp_name_${position}`] = employeeName;
    aliases[`اسم_الموظف_${position}`] = employeeName;
    aliases[`employee_id_${position}`] = String(item.ID || '');
  });

  return aliases;
}

function extractTemplateTags(text) {
  const source = String(text || '');
  const matches = [...source.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
  return [...new Set(matches.map((match) => String(match[1] || '').trim()).filter(Boolean))];
}

const PREPARATION_TEMPLATE_NAME = 'كشف حضور شعبة التحضير';
const PREPARATION_PREFERRED_NAMES = ['زينب', 'بشاير', 'نوره', 'عبدالله', 'حصه', 'محمد'];

function buildPreferredDisplayEmployees(employees, formName) {
  const list = Array.isArray(employees) ? employees : [];
  if (normalize(formName) !== PREPARATION_TEMPLATE_NAME) {
    return list;
  }

  const pool = [...list];
  const ordered = PREPARATION_PREFERRED_NAMES.map((preferredName) => {
    const index = pool.findIndex((item) => normalize(item.Name).includes(preferredName));
    if (index >= 0) {
      return pool.splice(index, 1)[0];
    }

    return {
      ID: '',
      Name: preferredName,
      Department: '',
      Section: '',
      SubSection: ''
    };
  });

  return ordered;
}

function toLtrDate(value) {
  const raw = normalize(value);
  if (!raw) return '';
  return `\u202D${raw}\u202C`;
}

function buildInsertStatement(payload) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `INSERT INTO Transfer (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    values: keys.map((key) => payload[key])
  };
}

function buildUpdateStatement(payload, id) {
  const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(payload, column));
  if (!keys.length) return null;
  return {
    sql: `UPDATE Transfer SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE ID = ?`,
    values: [...keys.map((key) => payload[key]), id]
  };
}

router.get('/forms/options', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT TemplateName
      FROM AdministrativeTemplateConfigs
      ORDER BY TemplateName ASC
    `).all();

    const formNames = rows.map((row) => normalize(row.TemplateName)).filter(Boolean);
    res.json({ formNames });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل بيانات النماذج الإدارية.' });
  }
});

router.get('/forms', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT ID, FormDate, PermitDate, DayName, EmployeeName, Department, SubSection, Section, FormName, FromTime, ToTime, PermitReason, LeaveStartDate, LeaveEndDate, LeaveType, Notes, CreatedAt, CreatedBy
      FROM AdministrativeForms
      ORDER BY FormDate DESC, ID DESC
      LIMIT 1000
    `).all();

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تحميل أرشيف النماذج الإدارية.' });
  }
});

router.post('/forms', (req, res) => {
  const formDateInput = normalize(req.body.FormDate);
  const permitDateInput = normalize(req.body.PermitDate);
  const formName = normalize(req.body.FormName);
  const fromTime = formatDisplayTime(req.body.FromTime);
  const toTime = formatDisplayTime(req.body.ToTime);
  const permitReason = normalize(req.body.PermitReason);
  const leaveStartDateInput = normalize(req.body.LeaveStartDate);
  const leaveEndDateInput = normalize(req.body.LeaveEndDate);
  const leaveType = normalize(req.body.LeaveType);
  const notes = normalize(req.body.Notes);
  const selectedEmpId = normalize(req.body.EmpID);
  const selectedDepartment = normalize(req.body.Department);
  const selectedSection = normalize(req.body.Section);
  const selectedSubSection = normalize(req.body.SubSection);
  let employee = selectedEmpId ? db.prepare(`
    SELECT ID, Name, Department, IFNULL(SubSection, '') AS SubSection, Section, Status
    FROM Main
    WHERE CAST(ID AS TEXT) = ?
    LIMIT 1
  `).get(selectedEmpId) : null;

  if (!formDateInput) {
    return res.status(400).json({ message: 'التاريخ مطلوب.' });
  }

  if (!formName) {
    return res.status(400).json({ message: 'اسم النموذج مطلوب.' });
  }

  // Employee selection is optional for this screen.
  // If an outdated/non-active employee id is submitted, ignore it and continue.
  if (employee && normalize(employee.Status) !== 'نشط') {
    employee = null;
  }

  const normalizedDate = formatDateOnly(formDateInput.replace(/-/g, '/'));
  if (!normalizedDate) {
    return res.status(400).json({ message: 'صيغة التاريخ غير صالحة.' });
  }

  const permitDate = permitDateInput ? formatDateOnly(permitDateInput.replace(/-/g, '/')) : '';
  if (permitDateInput && !permitDate) {
    return res.status(400).json({ message: 'صيغة تاريخ الاستئذان غير صالحة.' });
  }

  const leaveStartDate = leaveStartDateInput ? formatDateOnly(leaveStartDateInput.replace(/-/g, '/')) : '';
  const leaveEndDate = leaveEndDateInput ? formatDateOnly(leaveEndDateInput.replace(/-/g, '/')) : '';

  if (leaveStartDateInput && !leaveStartDate) {
    return res.status(400).json({ message: 'صيغة بداية الإجازة غير صالحة.' });
  }

  if (leaveEndDateInput && !leaveEndDate) {
    return res.status(400).json({ message: 'صيغة نهاية الإجازة غير صالحة.' });
  }

  const dayName = getArabicDayName(normalizedDate.replace(/\//g, '-'));
  const createdAt = getCurrentTimestamp();
  const finalDepartment = selectedDepartment || normalize(employee?.Department);
  const finalSection = selectedSection || normalize(employee?.Section);
  const finalSubSection = selectedSubSection || normalize(employee?.SubSection);

  if (!finalDepartment) {
    return res.status(400).json({ message: 'يرجى اختيار القسم.' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO AdministrativeForms (
        FormDate, PermitDate, DayName, FormName, EmpID, EmployeeName, Department, SubSection, Section, FromTime, ToTime, PermitReason, LeaveStartDate, LeaveEndDate, LeaveType, Notes, CreatedAt, CreatedBy
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalizedDate,
      permitDate,
      dayName,
      formName,
      String(employee?.ID || ''),
      normalize(employee?.Name),
      finalDepartment,
      finalSubSection,
      finalSection,
      fromTime,
      toTime,
      permitReason,
      leaveStartDate,
      leaveEndDate,
      leaveType,
      notes,
      createdAt,
      req.user?.username || 'system'
    );

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Add',
      page: 'Administrative',
      details: `Archived administrative form ID=${result.lastInsertRowid}`
    });

    res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر تسجيل النموذج الإداري.' });
  }
});

router.post('/forms/print-group', async (req, res) => {
  const formName = normalize(req.body.FormName);
  const department = normalize(req.body.Department);
  const section = normalize(req.body.Section);
  const subSection = normalize(req.body.SubSection);
  const formDate = formatDate(req.body.FormDate);
  const notes = normalize(req.body.Notes);

  if (!formName) {
    return res.status(400).json({ message: 'اسم النموذج مطلوب للطباعة.' });
  }

  if (!department) {
    return res.status(400).json({ message: 'يرجى اختيار القسم قبل الطباعة.' });
  }

  const config = db.prepare(`
    SELECT TemplateFileName
    FROM AdministrativeTemplateConfigs
    WHERE TemplateName = ?
    LIMIT 1
  `).get(formName);

  if (!config || !normalize(config.TemplateFileName)) {
    return res.status(404).json({ message: 'تعذر العثور على ملف النموذج المرتبط بهذا الاسم.' });
  }

  const employeeQueryParts = [
    "Status = 'نشط'",
    'Department = ?'
  ];
  const employeeParams = [department];

  if (subSection) {
    employeeQueryParts.push("IFNULL(SubSection, '') = ?");
    employeeParams.push(subSection);
  }

  const employees = db.prepare(`
    SELECT ID, Name, Department, Section, IFNULL(SubSection, '') AS SubSection
    FROM Main
    WHERE ${employeeQueryParts.join(' AND ')}
    ORDER BY Name ASC
  `).all(...employeeParams);

  if (!employees.length) {
    return res.status(404).json({ message: 'لا يوجد موظفون نشطون مطابقون للخيارات المحددة.' });
  }

  let templatePath = '';
  try {
    templatePath = getTemplatePath(normalize(config.TemplateFileName));
  } catch (error) {
    return res.status(400).json({ message: error.message || 'ملف النموذج غير صالح.' });
  }

  let templateTags = [];
  try {
    templateTags = extractTemplateTags(readTemplateTags(templatePath));
  } catch {
    templateTags = [];
  }

  const displayEmployees = buildPreferredDisplayEmployees(employees, formName);

  const previewPayload = {
    formName,
    formDate,
    department,
    section,
    subSection,
    employees: displayEmployees.map((item, index) => ({
      index: index + 1,
      id: String(item.ID || ''),
      name: normalize(item.Name)
    }))
  };

  if (!templateTags.length) {
    const output = createOutputPaths('administrative-group');
    const payload = {
      ...previewPayload,
      ...buildEmployeeAliases(displayEmployees),
      employees: displayEmployees
    };

    renderDocxFromTemplate(templatePath, payload, output.docxPath);
    if (normalize(formName) === PREPARATION_TEMPLATE_NAME) {
      applyPreparationTemplateFormatting(output.docxPath);
    }
    const pdfResult = convertDocxToPdf(output.docxPath, output.pdfPath);

    return res.json({
      message: 'تم تجهيز الملف من القالب المرفوع نفسه.',
      result: {
        docxUrl: output.docxUrl,
        pdfUrl: pdfResult.converted ? output.pdfUrl : '',
        pdfConverted: pdfResult.converted,
        pdfMessage: pdfResult.converted ? 'تم توليد PDF بنجاح.' : `تم إنشاء DOCX فقط: ${pdfResult.reason}`
      },
      preview: previewPayload
    });
  }

  try {
    const output = createOutputPaths('administrative-group');
    const payload = {
      form_name: formName,
      form_date: toLtrDate(formDate),
      day_name: formDate ? getArabicDayName(formDate.replace(/\//g, '-')) : '',
      department,
      section,
      sub_section: subSection,
      notes,
      created_by: req.user?.username || 'system',
      created_at: formatTimestamp(new Date()),
      employees: displayEmployees.map((item, index) => ({
        index: index + 1,
        id: String(item.ID || ''),
        name: normalize(item.Name),
        department: normalize(item.Department),
        section: normalize(item.Section),
        sub_section: normalize(item.SubSection)
      })),
      ...buildEmployeeAliases(displayEmployees)
    };

    renderDocxFromTemplate(templatePath, payload, output.docxPath);
    if (normalize(formName) === PREPARATION_TEMPLATE_NAME) {
      applyPreparationTemplateFormatting(output.docxPath);
    }
    const pdfResult = convertDocxToPdf(output.docxPath, output.pdfPath);

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Print',
      page: 'Administrative',
      details: `Generated group form for ${department}/${section || '-'} / ${subSection || '-'} using ${formName}`
    });

    return res.json({
      message: `تم تجهيز الطباعة لعدد ${employees.length} موظف.` ,
      result: {
        docxUrl: output.docxUrl,
        pdfUrl: pdfResult.converted ? output.pdfUrl : '',
        pdfConverted: pdfResult.converted,
        pdfMessage: pdfResult.converted ? 'تم توليد PDF بنجاح.' : `تم إنشاء DOCX فقط: ${pdfResult.reason}`
      },
      preview: previewPayload
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر توليد طباعة النموذج الإداري.' });
  }
});

router.get('/transfers', (req, res) => {
  const records = db.prepare('SELECT * FROM Transfer ORDER BY ID DESC LIMIT 1000').all();
  res.json(records);
});

router.get('/transfers/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'معرّف غير صالح' });

  const record = db.prepare('SELECT * FROM Transfer WHERE ID = ?').get(id);
  return record ? res.json(record) : res.status(404).json({ message: 'السجل غير موجود' });
});

router.post('/transfers', (req, res) => {
  const statement = buildInsertStatement(req.body);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  logSystem({ userName: req.body.userName || 'system', action: 'Add', page: 'Transfer', details: `Added transfer ID=${result.lastInsertRowid}` });
  res.json({ id: result.lastInsertRowid });
});

router.put('/transfers/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'معرّف غير صالح' });

  const statement = buildUpdateStatement(req.body, id);
  if (!statement) {
    return res.status(400).json({ message: 'البيانات المرسلة غير كافية' });
  }

  const result = db.prepare(statement.sql).run(statement.values);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للتعديل' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Update', page: 'Transfer', details: `Updated transfer ID=${id}` });
  res.json({ changes: result.changes });
});

router.delete('/transfers/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: 'معرّف غير صالح' });

  const result = db.prepare('DELETE FROM Transfer WHERE ID = ?').run(id);
  if (result.changes === 0) {
    return res.status(404).json({ message: 'السجل غير موجود للحذف' });
  }

  logSystem({ userName: req.body.userName || 'system', action: 'Delete', page: 'Transfer', details: `Deleted transfer ID=${id}` });
  res.json({ changes: result.changes });
});

module.exports = router;

