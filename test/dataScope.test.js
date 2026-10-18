const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getDataScope,
  isWithinDataScope,
  filterByDataScope
} = require('../auth/dataScope');

test('admin bypasses every data scope restriction', () => {
  const access = {
    isAdmin: true,
    allowedDepartments: ['البلاغات'],
    allowedSections: ['أ - البلاغات'],
    allowedSubSections: ['شعبة 1']
  };

  assert.equal(isWithinDataScope({
    Department: 'العمليات',
    Section: 'هـ - العمليات',
    SubSection: 'شعبة أخرى'
  }, access), true);
});

test('non-admin is restricted by explicit department, section, and subsection permissions', () => {
  const access = {
    isAdmin: false,
    allowedDepartments: ['البلاغات'],
    allowedSections: ['أ - البلاغات'],
    allowedSubSections: ['شعبة 1']
  };

  assert.equal(isWithinDataScope({
    Department: 'البلاغات',
    Section: 'أ - البلاغات',
    SubSection: 'شعبة 1'
  }, access), true);
  assert.equal(isWithinDataScope({
    Department: 'البلاغات',
    Section: 'ب - البلاغات',
    SubSection: 'شعبة 1'
  }, access), false);
});

test('legacy users fall back to their assigned scope when explicit permissions are empty', () => {
  const access = {
    isAdmin: false,
    department: 'الإحصاء',
    section: 'صباحاً',
    subSection: '',
    allowedDepartments: [],
    allowedSections: [],
    allowedSubSections: []
  };

  assert.deepEqual(getDataScope(access), {
    isAdmin: false,
    departments: ['الاحصاء'],
    sections: ['صباحاً'],
    subSections: []
  });
});

test('non-admin without an assigned or explicit scope sees no records', () => {
  assert.deepEqual(filterByDataScope([
    { Department: 'البلاغات', Section: 'أ - البلاغات' }
  ], { isAdmin: false }), []);
});

test('scope aliases fall back only for null or undefined values', () => {
  const access = {
    allowedDepartments: ['البلاغات'],
    allowedSections: ['أ - البلاغات'],
    allowedSubSections: ['شعبة 1']
  };
  assert.equal(isWithinDataScope({
    Department: null,
    department: 'البلاغات',
    Section: undefined,
    section: null,
    Shift: 'أ - البلاغات',
    SubSection: null,
    subSection: 'شعبة 1'
  }, access), true);
  assert.equal(isWithinDataScope({
    Department: '',
    department: 'البلاغات',
    Section: 'أ - البلاغات',
    SubSection: 'شعبة 1'
  }, access), false);
  assert.equal(isWithinDataScope(null, access), false);
});
