function translateAction(action) {
  const value = String(action || '').trim();
  const key = value.toLowerCase();
  const map = {
    add: 'إضافة',
    update: 'تعديل',
    delete: 'حذف',
    view: 'عرض البيانات',
    open: 'دخول',
    close: 'خروج',
    print: 'طباعة',
    search: 'بحث',
    upload: 'رفع ملف',
    backup: 'نسخ احتياطي',
    restore: 'استعادة نسخة احتياطية',
    download: 'تنزيل ملف',
    'login success': 'نجح تسجيل الدخول',
    'login failed': 'فشل تسجيل الدخول',
    'login error': 'خطأ تسجيل الدخول'
  };

  if (map[key]) return map[key];
  return /[A-Za-z]/.test(value) ? 'عملية نظام' : value;
}

function translateTarget(target) {
  const value = String(target || '').trim();
  const key = value.toLowerCase().replace(/\s+/g, '');
  const map = {
    main: 'الموظفين',
    employees: 'الموظفين',
    'outside-employees': 'الموظفين خارج الإدارة',
    outsideemployees: 'الموظفين خارج الإدارة',
    holiday: 'الإجازات',
    holidays: 'الإجازات',
    course: 'الدورات',
    courses: 'الدورات',
    transfer: 'التنقلات',
    transfers: 'التنقلات',
    daily: 'اليوميات',
    evaluations: 'تقييم الأداء',
    statistics: 'الإحصائيات',
    login: 'تسجيل الدخول',
    settings: 'الإعدادات',
    dashboard: 'الرئيسية',
    'system-log': 'سجل النظام',
    systemlog: 'سجل النظام',
    administrative: 'النماذج الإدارية',
    administrativeforms: 'النماذج الإدارية',
    administrativetemplate: 'قوالب النماذج الإدارية',
    archive: 'الأرشيف',
    categories: 'مجلدات الأرشيف',
    attachments: 'المرفقات',
    incoming: 'الوارد',
    outgoing: 'الصادر',
    reduction: 'تخفيف العمل',
    database: 'قاعدة البيانات',
    api: 'واجهة النظام'
  };

  if (/^daily[1-4]$/i.test(value) || /^dailyall(_p)?$/i.test(value)) {
    return 'اليوميات';
  }

  if (map[key]) return map[key];
  return /[A-Za-z]/.test(value) ? 'النظام' : value;
}

function translateMobileRequest(text) {
  const match = text.match(/^Mobile\s+(GET|HEAD|POST|PUT|PATCH|DELETE)\s+([^\s]+)\s+status=(\d+)(.*)$/i);
  if (!match) return '';

  const methodMap = {
    GET: 'عرض',
    HEAD: 'عرض',
    POST: 'إضافة',
    PUT: 'تعديل',
    PATCH: 'تعديل',
    DELETE: 'حذف'
  };
  const pathMap = {
    categories: 'مجلدات الأرشيف',
    employees: 'الموظفين',
    holidays: 'الإجازات',
    outgoing: 'الصادر',
    incoming: 'الوارد',
    statistics: 'الإحصائيات',
    transfers: 'التنقلات',
    archive: 'الأرشيف',
    dashboard: 'الرئيسية',
    'daily-logs': 'اليوميات',
    'outside-employees': 'الموظفين خارج الإدارة'
  };
  const path = match[2];
  const firstPart = path.split('?')[0].split('/').filter(Boolean)[0] || '';
  const translatedPath = pathMap[firstPart.toLowerCase()] || 'واجهة النظام';
  return `${methodMap[match[1].toUpperCase()]} ${translatedPath} من الموبايل، رمز الاستجابة ${match[3]}${match[4] || ''}`;
}

function translateDetails(details) {
  const value = String(details || '').trim();
  if (!value) return value;

  const mobileRequest = translateMobileRequest(value);
  if (mobileRequest) return mobileRequest;

  const exactPatterns = [
    {
      pattern: /^Created verified daily database backup:.*$/i,
      value: 'تم إنشاء نسخة احتياطية يومية موثقة لقاعدة البيانات'
    },
    {
      pattern: /^Daily database backup already exists and is valid:.*$/i,
      value: 'النسخة الاحتياطية اليومية لقاعدة البيانات موجودة وصالحة'
    },
    {
      pattern: /^Unknown encoding:\s*base64url$/i,
      value: 'ترميز الرابط غير معروف'
    },
    {
      pattern: /^database is locked$/i,
      value: 'قاعدة البيانات مقفلة بواسطة عملية أخرى'
    },
    {
      pattern: /^worker exited with code\s+(.+)$/i,
      value: (match) => `توقفت خدمة النسخ الاحتياطي، رمز الخروج ${match[1]}`
    },
    {
      pattern: /^Uploaded archive ID=(\d+) category=(.+)$/i,
      value: (match) => `تم رفع ملف إلى الأرشيف، المعرّف ${match[1]}، المجلد ${translateCategory(match[2])}`
    },
    {
      pattern: /^(Uploaded|Deleted) attachment\s+([^/]+)\/(\d+)\/.*$/i,
      value: (match) => `${match[1].toLowerCase() === 'uploaded' ? 'تم رفع' : 'تم حذف'} مرفق من ${translateTarget(match[2])}، معرّف السجل ${match[3]}`
    },
    {
      pattern: /^(Added|Updated|Deleted) work reduction ID=(\d+)$/i,
      value: (match) => `${translatePastAction(match[1])} سجل تخفيف العمل، المعرّف ${match[2]}`
    },
    {
      pattern: /^(Added|Deleted) archive category\s+(.+)$/i,
      value: (match) => `${translatePastAction(match[1])} مجلد أرشيف ${translateCategory(match[2])}`
    }
  ];

  for (const item of exactPatterns) {
    const match = value.match(item.pattern);
    if (match) return typeof item.value === 'function' ? item.value(match) : item.value;
  }

  const directPhrases = [
    [/User logged in/gi, 'تم تسجيل دخول المستخدم'],
    [/User logged out/gi, 'تم تسجيل خروج المستخدم'],
    [/User not found/gi, 'المستخدم غير موجود'],
    [/Invalid password/gi, 'كلمة المرور غير صحيحة'],
    [/Inactive user/gi, 'المستخدم غير نشط'],
    [/Missing username or password/gi, 'اسم المستخدم أو كلمة المرور مفقود'],
    [/Generated single daily record for/gi, 'تم إنشاء سجل يومي واحد للموظف'],
    [/Generated daily records/gi, 'تم إنشاء سجلات يومية'],
    [/Bulk updated/gi, 'تم تعديل جماعي لعدد'],
    [/Uploaded attachment/gi, 'تم رفع المرفق'],
    [/Deleted attachment/gi, 'تم حذف المرفق'],
    [/Uploaded archive/gi, 'تم رفع ملف إلى الأرشيف'],
    [/Uploaded template/gi, 'تم رفع القالب'],
    [/Generated leave permit for/gi, 'تم إنشاء تصريح مغادرة للموظف'],
    [/Generated group form for/gi, 'تم إنشاء نموذج جماعي لـ'],
    [/Archived administrative form/gi, 'تمت أرشفة النموذج الإداري']
  ];

  let translated = value;
  directPhrases.forEach((item) => {
    translated = translated.replace(item[0], item[1]);
  });

  const terms = [
    [/department-section/gi, 'القسم/النوبة'],
    [/admin password/gi, 'كلمة سر المدير'],
    [/login user/gi, 'مستخدم النظام'],
    [/daily records?/gi, 'سجلات يومية'],
    [/employee/gi, 'موظف'],
    [/holiday/gi, 'إجازة'],
    [/course/gi, 'دورة'],
    [/transfer/gi, 'تنقل'],
    [/archive category/gi, 'مجلد أرشيف'],
    [/administrative template config/gi, 'إعداد قالب إداري'],
    [/template/gi, 'القالب'],
    [/category/gi, 'المجلد'],
    [/status/gi, 'الحالة'],
    [/source/gi, 'المصدر'],
    [/\bMobile\b/gi, 'الموبايل'],
    [/\bopen\b/gi, 'دخول'],
    [/\bclose\b/gi, 'خروج'],
    [/\bmain\b/gi, 'الرئيسية'],
    [/\bsystem\b/gi, 'النظام'],
    [/\busing\b/gi, 'باستخدام'],
    [/\bwith\b/gi, 'بواسطة'],
    [/\bsingle\b/gi, 'واحد'],
    [/\bfor\b/gi, 'لـ'],
    [/\bon\b/gi, 'بتاريخ'],
    [/\bto\b/gi, 'إلى']
  ];

  terms.forEach((item) => {
    translated = translated.replace(item[0], item[1]);
  });

  translated = translated
    .replace(/^Added\s+/i, 'تمت إضافة ')
    .replace(/^Updated\s+/i, 'تم تعديل ')
    .replace(/^Deleted\s+/i, 'تم حذف ')
    .replace(/^Generated\s+/i, 'تم إنشاء ')
    .replace(/^Created\s+/i, 'تم إنشاء ')
    .replace(/\bID=/gi, 'المعرّف=')
    .replace(/\bEmpID=/gi, 'معرّف الموظف=')
    .replace(/\bFileCount\b/gi, 'عدد الملفات');

  return translated;
}

function translateCategory(category) {
  const value = String(category || '').trim();
  const map = {
    circulars: 'التعاميم',
    statements: 'الكشوف',
    forms: 'النماذج',
    'confidential-books': 'الكتب السرية',
    general: 'عام',
    'temporary-child': 'مؤقت فرعي',
    'temporary-test': 'اختبار مؤقت'
  };
  return map[value.toLowerCase()] || 'مجلد مخصص';
}

function translatePastAction(action) {
  const map = {
    added: 'تمت إضافة',
    updated: 'تم تعديل',
    deleted: 'تم حذف'
  };
  return map[String(action || '').toLowerCase()] || 'تم تنفيذ عملية على';
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

module.exports = {
  localizeRecord,
  translateAction,
  translateDetails,
  translateTarget
};
