const test = require('node:test');
const assert = require('node:assert/strict');
const {
  translateAction,
  translateDetails,
  translateTarget
} = require('../services/systemLogLocalization');

test('translates system-log actions and pages to Arabic', () => {
  assert.equal(translateAction('Backup'), 'نسخ احتياطي');
  assert.equal(translateAction('Upload'), 'رفع ملف');
  assert.equal(translateAction('UnknownAction'), 'عملية نظام');
  assert.equal(translateTarget('categories'), 'مجلدات الأرشيف');
  assert.equal(translateTarget('Database'), 'قاعدة البيانات');
  assert.equal(translateTarget('UnknownPage'), 'النظام');
});

test('translates current mobile and login details to Arabic', () => {
  assert.equal(
    translateDetails('Mobile GET /categories status=200 | المصدر: الموبايل'),
    'عرض مجلدات الأرشيف من الموبايل، رمز الاستجابة 200 | المصدر: الموبايل'
  );
  assert.equal(
    translateDetails('User logged in | المصدر: الموبايل'),
    'تم تسجيل دخول المستخدم | المصدر: الموبايل'
  );
});

test('translates backup and generated-record details', () => {
  assert.match(
    translateDetails('Created verified daily database backup: G:\\Database\\Backups\\database-2026-09-14.db'),
    /^تم إنشاء نسخة احتياطية يومية موثقة لقاعدة البيانات$/
  );
  assert.match(translateDetails('Generated daily records (18) for 2026/09/03'), /^تم إنشاء سجلات يومية/);
});

test('translates technical details without corrupting longer words', () => {
  assert.equal(
    translateDetails('Uploaded archive ID=10 category=circulars'),
    'تم رفع ملف إلى الأرشيف، المعرّف 10، المجلد التعاميم'
  );
  assert.equal(
    translateDetails('Added work reduction ID=1'),
    'تمت إضافة سجل تخفيف العمل، المعرّف 1'
  );
  assert.equal(
    translateDetails('Uploaded attachment incoming/1/001.jpg'),
    'تم رفع مرفق من الوارد، معرّف السجل 1'
  );
  assert.equal(translateDetails('Unknown encoding: base64url'), 'ترميز الرابط غير معروف');
  assert.equal(translateDetails('database is locked'), 'قاعدة البيانات مقفلة بواسطة عملية أخرى');
});