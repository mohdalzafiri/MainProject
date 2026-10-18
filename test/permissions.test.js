const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLE_ADMIN,
  ROLE_USER,
  ROLE_VIEW_ONLY,
  ADMIN_ONLY_PAGE_KEYS,
  CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS,
  normalizeRole,
  normalizePageKey,
  parseAllowedPages,
  parseStoredPagePermissions,
  getEffectiveAllowedPages,
  getEffectiveEditablePages,
  serializeAllowedPages,
  serializePagePermissions
} = require('../auth/permissions');

test('normalizes supported roles and defaults unknown roles to user', () => {
  assert.equal(normalizeRole('Admin'), ROLE_ADMIN);
  assert.equal(normalizeRole('readonly'), ROLE_VIEW_ONLY);
  assert.equal(normalizeRole('unexpected'), ROLE_USER);
});

test('normalizes archive permission keys', () => {
  assert.equal(normalizePageKey('archive'), 'archive');
  assert.equal(normalizePageKey('confidential-books'), 'confidentialBooks');
  assert.equal(normalizePageKey('confidentialBooks'), 'confidentialBooks');
});

test('parses JSON and legacy comma-separated permissions', () => {
  assert.deepEqual(parseAllowedPages('["employees","daily"]'), ['employees', 'daily']);
  assert.deepEqual(parseAllowedPages('employees, daily'), ['employees', 'daily']);
});

test('admin receives all customizable and admin-only pages', () => {
  const allowedPages = getEffectiveAllowedPages(true, []);
  CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS.forEach((key) => assert.ok(allowedPages.includes(key)));
  ADMIN_ONLY_PAGE_KEYS.forEach((key) => assert.ok(allowedPages.includes(key)));
  assert.ok(allowedPages.includes('dashboard'));
});

test('non-admin permissions reject admin and unknown page keys', () => {
  const allowedPages = getEffectiveAllowedPages(false, ['employees', 'settings', 'unknown']);
  assert.deepEqual(allowedPages, ['employees']);
});

test('archive and confidential books permissions remain independent', () => {
  assert.deepEqual(getEffectiveAllowedPages(false, ['archive']), ['archive']);
  assert.deepEqual(getEffectiveAllowedPages(false, ['confidentialBooks']), ['confidentialBooks']);
  assert.deepEqual(
    getEffectiveAllowedPages(false, ['archive', 'confidentialBooks']),
    ['archive', 'confidentialBooks']
  );
});

test('query and statistics permissions remain independent', () => {
  assert.deepEqual(getEffectiveAllowedPages(false, ['query']), ['query']);
  assert.deepEqual(getEffectiveAllowedPages(false, ['statistics']), ['statistics']);
  assert.deepEqual(getEffectiveAllowedPages(false, ['query', 'statistics']), ['query', 'statistics']);
  assert.equal(serializeAllowedPages(['query']), '["query"]');
});

test('legacy page permissions remain editable until explicitly configured', () => {
  assert.deepEqual(getEffectiveEditablePages(false, ['employees', 'daily']), ['employees', 'daily']);
  assert.deepEqual(getEffectiveEditablePages(false, ['employees'], true), []);
});

test('configured edit permissions remain independent from view permissions', () => {
  const serialized = serializePagePermissions(
    ['employees', 'daily', 'query'],
    ['employees', 'query', 'settings']
  );
  assert.equal(
    serialized,
    '["employees","daily","query","pageEditsConfigured","edit:employees","edit:query"]'
  );
  assert.deepEqual(parseAllowedPages(serialized), ['employees', 'daily', 'query']);
  assert.deepEqual(getEffectiveEditablePages(false, serialized), ['employees', 'query']);
  assert.deepEqual(parseStoredPagePermissions(serialized), {
    allowedPages: ['employees', 'daily', 'query'],
    editablePages: ['employees', 'query'],
    editsConfigured: true
  });
});

test('serialization removes duplicates and unsupported keys', () => {
  const serialized = serializeAllowedPages(['courses', 'courses', 'settings', 'invalid']);
  assert.equal(serialized, '["courses"]');
});