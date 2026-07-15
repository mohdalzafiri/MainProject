const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db, logSystem } = require('../database');
const {
  templatesRoot,
  formatDate,
  formatTime,
  formatTimestamp,
  listTemplates,
  getTemplatePath,
  readTemplateTags,
  createOutputPaths,
  renderDocxFromTemplate,
  convertDocxToPdf,
  ensureDirectories
} = require('../services/wordTemplateService');

const router = express.Router();

ensureDirectories();

function normalizeUploadFileName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const hasArabic = /[\u0600-\u06FF]/.test(raw);
  const hasMojibake = /[ÃØÙÐ]/.test(raw);
  if (hasMojibake && !hasArabic) {
    try {
      return Buffer.from(raw, 'latin1').toString('utf8').trim();
    } catch {
      return raw;
    }
  }

  return raw;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, templatesRoot),
    filename: (_req, file, cb) => {
      const safeName = path.basename(normalizeUploadFileName(file.originalname));
      cb(null, safeName);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isDocx = String(file.originalname || '').toLowerCase().endsWith('.docx');
    if (!isDocx) {
      return cb(new Error('ONLY_DOCX_ALLOWED'));
    }
    return cb(null, true);
  }
});

function normalize(value) {
  return String(value || '').trim();
}

function normalizeArabicDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
}

function normalizeTimeInput(value) {
  return normalizeArabicDigits(value)
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[\u066B\uFF1A]/g, ':')
    .trim();
}

function formatDisplayTime(value) {
  const normalized = formatTime(normalizeTimeInput(value));
  return normalized ? normalized.slice(0, 5) : '';
}

function deriveTemplateNameFromFileName(fileName) {
  const baseName = path.parse(String(fileName || '').trim()).name;
  return normalize(baseName);
}

function resolveLeavePermitTemplateFileName(templateName) {
  const raw = normalize(templateName);
  if (!raw) return '';

  if (raw.toLowerCase().endsWith('.docx')) {
    return raw;
  }

  const mapped = db.prepare(`
    SELECT TemplateFileName
    FROM AdministrativeTemplateConfigs
    WHERE TemplateName = ?
    LIMIT 1
  `).get(raw);

  const fileName = normalize(mapped?.TemplateFileName);
  if (fileName) {
    return fileName;
  }

  const matchedByBaseName = listTemplates().find(
    (file) => deriveTemplateNameFromFileName(file) === raw
  );

  return normalize(matchedByBaseName);
}

function getArabicDayName(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return days[date.getDay()] || '';
}

function toLtrDate(value) {
  const raw = normalize(value);
  if (!raw) return '';
  return `\u202D${raw}\u202C`;
}

const requiredFieldGroups = [
  { key: 'employee_name', aliases: ['employee_name', 'employeeName', 'employee_full_name', 'اسم_الموظف', 'اسم_الموظف_الرباعي'] },
  { key: 'permit_date', aliases: ['permit_date', 'date', 'request_date', 'تاريخ_الاستئذان', 'تاريخ'] },
  { key: 'from_time', aliases: ['from_time', 'out_time', 'start_time', 'وقت_الخروج', 'وقت_الانصراف'] },
  { key: 'to_time', aliases: ['to_time', 'return_time', 'end_time', 'وقت_العودة'] },
  { key: 'reason', aliases: ['reason', 'permit_reason', 'note_reason', 'سبب_الاستئذان', 'السبب'] }
];

const leaveRequiredFieldGroups = [
  { key: 'employee_name', aliases: ['employee_name', 'employeeName', 'employee_full_name', 'اسم_الموظف', 'اسم_الموظف_الرباعي'] },
  { key: 'leave_start_date', aliases: ['leave_start_date', 'leaveStartDate', 'بداية_الاجازة', 'بداية_الإجازة'] },
  { key: 'leave_end_date', aliases: ['leave_end_date', 'leaveEndDate', 'نهاية_الاجازة', 'نهاية_الإجازة'] },
  { key: 'leave_days', aliases: ['leave_days', 'leaveDays', 'عدد_الايام', 'عدد_الأيام'] }
];

const aliasMap = {
  employee_id: ['employee_id', 'employeeId', 'emp_id', 'empId', 'رقم_الموظف'],
  employee_name: ['employee_name', 'employeeName', 'employee_full_name', 'name', 'اسم_الموظف', 'اسم_الموظف_الرباعي', 'الاسم'],
  civil_id: ['civil_id', 'civilId', 'employee_civil_id', 'رقم_مدني', 'الرقم_المدني', 'الرقم_المدني_للموظف'],
  department: ['department', 'dept', 'القسم'],
  section: ['section', 'shift', 'النوبة'],
  sub_section: ['sub_section', 'subSection', 'الشعبة'],
  title: ['title', 'employee_title', 'employee_rank', 'الرتبة'],
  rank: ['rank', 'job_title', 'position', 'المسمى', 'المسمى_الوظيفي'],
  current_day_name: ['current_day_name', 'today_day_name', 'current_day', 'today_day', 'day_today', 'اليوم_الحالي'],
  current_date: ['current_date', 'today_date', 'print_date', 'date_today', 'تاريخ_اليوم', 'التاريخ_الحالي'],
  day_name: ['day_name', 'dayName', 'day', 'اليوم'],
  permit_date: ['permit_date', 'date', 'request_date', 'تاريخ_الاستئذان', 'تاريخ'],
  from_time: ['from_time', 'out_time', 'start_time', 'وقت_الخروج', 'وقت_الانصراف'],
  to_time: ['to_time', 'return_time', 'end_time', 'وقت_العودة'],
  reason: ['reason', 'permit_reason', 'note_reason', 'سبب_الاستئذان', 'السبب'],
  leave_type: ['leave_type', 'leaveType', 'نوع_الاجازة', 'نوع_الإجازة'],
  leave_days: ['leave_days', 'leaveDays', 'عدد_الايام', 'عدد_الأيام'],
  leave_start_date: ['leave_start_date', 'leaveStartDate', 'بداية_الاجازة', 'بداية_الإجازة'],
  leave_end_date: ['leave_end_date', 'leaveEndDate', 'نهاية_الاجازة', 'نهاية_الإجازة'],
  notes: ['notes', 'note', 'ملاحظات'],
  created_by: ['created_by', 'createdBy', 'prepared_by', 'منظم_الطلب', 'مقدم_الطلب'],
  created_at: ['created_at', 'createdAt', 'timestamp', 'تاريخ_الانشاء', 'وقت_الانشاء']
};

function normalizeTag(value) {
  return String(value || '').trim().toLowerCase();
}

function extractTags(text) {
  const tags = new Set();
  const matches = String(text || '').match(/\{\{\s*([^{}\s]+)\s*\}\}/g) || [];
  matches.forEach((item) => {
    const match = item.match(/\{\{\s*([^{}\s]+)\s*\}\}/);
    if (match && match[1]) tags.add(match[1]);
  });
  return [...tags].sort((a, b) => a.localeCompare(b));
}

function getTemplateValidation(tags) {
  const normalizedTags = new Set((tags || []).map((tag) => normalizeTag(tag)));

  const hasLeaveRangeTags = leaveRequiredFieldGroups
    .slice(1)
    .some((group) => group.aliases.some((alias) => normalizedTags.has(normalizeTag(alias))));

  const validationGroups = hasLeaveRangeTags ? leaveRequiredFieldGroups : requiredFieldGroups;

  const missingRequiredFields = validationGroups
    .filter((group) => !group.aliases.some((alias) => normalizedTags.has(normalizeTag(alias))))
    .map((group) => group.key);

  return {
    isReady: missingRequiredFields.length === 0,
    missingRequiredFields
  };
}

function buildTemplateInfo(fileName) {
  const templatePath = path.join(templatesRoot, fileName);
  const stats = fs.statSync(templatePath);
  let tags = [];

  try {
    const text = readTemplateTags(templatePath);
    tags = extractTags(text);
  } catch {
    tags = [];
  }

  const validation = getTemplateValidation(tags);

  return {
    fileName,
    size: stats.size,
    updatedAt: formatTimestamp(stats.mtime),
    tags,
    isReady: validation.isReady,
    missingRequiredFields: validation.missingRequiredFields
  };
}

function templateHasAnyTag(tags, aliases) {
  const normalizedTags = new Set((tags || []).map((tag) => normalizeTag(tag)));
  return (aliases || []).some((alias) => normalizedTags.has(normalizeTag(alias)));
}

function expandPayloadAliases(basePayload) {
  const expanded = {};

  Object.entries(basePayload).forEach(([key, value]) => {
    const aliases = aliasMap[key] || [key];
    aliases.forEach((alias) => {
      expanded[alias] = value;
    });
  });

  return expanded;
}

function findActiveEmployee(empId) {
  return db.prepare(`
    SELECT ID, Title, Name, CivilID, Department, Section, IFNULL(SubSection, '') AS SubSection, Status, Rank
    FROM Main
    WHERE CAST(ID AS TEXT) = ?
    LIMIT 1
  `).get(String(empId || ''));
}


router.get('/templates', (_req, res) => {
  try {
    const templates = listTemplates().map((fileName) => buildTemplateInfo(fileName));

    return res.json({ templates });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر قراءة قوالب Word.' });
  }
});

router.post('/templates/upload', upload.single('template'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'يرجى اختيار ملف DOCX.' });
    }

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Add',
      page: 'AdministrativeTemplate',
      details: `Uploaded template ${req.file.filename}`
    });

    const info = buildTemplateInfo(req.file.filename);

    return res.json({
      message: 'تم رفع القالب بنجاح.',
      fileName: req.file.filename,
      templateName: deriveTemplateNameFromFileName(req.file.filename),
      validation: {
        isReady: info.isReady,
        missingRequiredFields: info.missingRequiredFields,
        tags: info.tags
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر رفع ملف القالب.' });
  }
});

router.post('/leave-permit/generate', (req, res) => {
  const templateName = normalize(req.body.templateName);
  const empId = normalize(req.body.empId);
  const permitDate = formatDate(req.body.permitDate);
  const fromTime = formatDisplayTime(req.body.fromTime);
  const toTime = formatDisplayTime(req.body.toTime);
  const reason = normalize(req.body.reason);
  const notes = normalize(req.body.notes);
  const leaveType = normalize(req.body.leaveType || req.body.leave_type);
  const leaveStartDate = formatDate(req.body.leaveStartDate || req.body.leave_start_date);
  const leaveEndDate = formatDate(req.body.leaveEndDate || req.body.leave_end_date);

  const leaveDaysInput = normalize(req.body.leaveDays || req.body.leave_days);
  let leaveDays = leaveDaysInput;
  if (!leaveDays && leaveStartDate && leaveEndDate) {
    const from = new Date(leaveStartDate.replace(/\//g, '-'));
    const to = new Date(leaveEndDate.replace(/\//g, '-'));
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      const ms = to.getTime() - from.getTime();
      if (ms >= 0) {
        leaveDays = String(Math.floor(ms / (24 * 60 * 60 * 1000)) + 1);
      }
    }
  }

  if (!templateName) {
    return res.status(400).json({ message: 'اسم القالب مطلوب.' });
  }

  if (!empId) {
    return res.status(400).json({ message: 'رقم الموظف مطلوب.' });
  }

  const employee = findActiveEmployee(empId);

  if (!employee) {
    return res.status(404).json({ message: 'الموظف المحدد غير موجود.' });
  }

  if (normalize(employee.Status) !== 'نشط') {
    return res.status(400).json({ message: 'لا يمكن إنشاء استئذان لموظف غير نشط.' });
  }

  let templatePath = '';
  const templateFileName = resolveLeavePermitTemplateFileName(templateName);
  if (!templateFileName) {
    return res.status(404).json({ message: 'تعذر العثور على ملف القالب المرتبط باسم النموذج المحدد.' });
  }

  try {
    templatePath = getTemplatePath(templateFileName);
  } catch (error) {
    return res.status(400).json({ message: error.message || 'اسم القالب غير صالح.' });
  }

  const templateInfo = buildTemplateInfo(templateFileName);
  const needsPermitDate = templateHasAnyTag(templateInfo.tags, aliasMap.permit_date);
  const needsTimeRange = templateHasAnyTag(templateInfo.tags, aliasMap.from_time)
    || templateHasAnyTag(templateInfo.tags, aliasMap.to_time);
  const needsLeaveRange = templateHasAnyTag(templateInfo.tags, aliasMap.leave_start_date)
    || templateHasAnyTag(templateInfo.tags, aliasMap.leave_end_date)
    || templateHasAnyTag(templateInfo.tags, aliasMap.leave_days);

  if (needsPermitDate && !permitDate) {
    return res.status(400).json({ message: 'تاريخ الاستئذان مطلوب بصيغة yyyy/mm/dd.' });
  }

  if (needsTimeRange && !fromTime && !toTime) {
    return res.status(400).json({ message: 'يرجى إدخال وقت الخروج أو وقت العودة على الأقل بصيغة HH:mm.' });
  }

  if (needsLeaveRange && (!leaveStartDate || !leaveEndDate)) {
    return res.status(400).json({ message: 'يرجى إدخال بداية الإجازة ونهايتها بصيغة yyyy/mm/dd.' });
  }

  try {
    const output = createOutputPaths('leave-permit');
    const currentDate = formatDate(new Date());
    const currentDayName = getArabicDayName(new Date());
    const dayName = permitDate ? getArabicDayName(permitDate.replace(/\//g, '-')) : '';
    const basePayload = {
      employee_id: String(employee.ID || ''),
      employee_name: normalize(employee.Name),
      civil_id: normalize(employee.CivilID),
      department: normalize(employee.Department),
      section: normalize(employee.Section),
      sub_section: normalize(employee.SubSection),
      title: normalize(employee.Title),
      rank: normalize(employee.Rank),
      current_day_name: currentDayName,
      current_date: toLtrDate(currentDate),
      day_name: dayName,
      permit_date: toLtrDate(permitDate),
      from_time: fromTime || '    :     ',
      to_time: toTime || '    :     ',
      reason,
      leave_type: leaveType,
      leave_days: leaveDays,
      leave_start_date: toLtrDate(leaveStartDate),
      leave_end_date: toLtrDate(leaveEndDate),
      notes,
      created_by: req.user?.username || 'system',
      created_at: formatTimestamp(new Date())
    };

    const payload = expandPayloadAliases(basePayload);

    renderDocxFromTemplate(templatePath, payload, output.docxPath);

    const pdfResult = convertDocxToPdf(output.docxPath, output.pdfPath);

    logSystem({
      userName: req.user?.username || 'system',
      role: req.user?.role || '',
      action: 'Add',
      page: 'AdministrativeTemplate',
      details: `Generated leave permit for EmpID=${employee.ID} with template=${templateName}`
    });

    return res.json({
      message: 'تم إنشاء نموذج الاستئذان بنجاح.',
      templateName,
      payloadKeys: Object.keys(payload),
      templateValidation: {
        isReady: templateInfo.isReady,
        missingRequiredFields: templateInfo.missingRequiredFields,
        tags: templateInfo.tags
      },
      result: {
        docxUrl: output.docxUrl,
        pdfUrl: pdfResult.converted ? output.pdfUrl : '',
        pdfConverted: pdfResult.converted,
        pdfMessage: pdfResult.converted ? 'تم توليد PDF بنجاح.' : `تم إنشاء DOCX فقط: ${pdfResult.reason}`
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'تعذر توليد نموذج الاستئذان.' });
  }
});

router.use((error, _req, res, next) => {
  if (error && error.message === 'ONLY_DOCX_ALLOWED') {
    return res.status(400).json({ message: 'صيغة الملف غير مدعومة. استخدم DOCX فقط.' });
  }

  if (error && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'حجم الملف كبير. الحد الأقصى 10MB.' });
  }

  return next(error);
});

module.exports = router;