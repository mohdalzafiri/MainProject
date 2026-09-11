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
  getEffectiveAllowedPages,
  serializeAllowedPages
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

test('serialization removes duplicates and unsupported keys', () => {
  const serialized = serializeAllowedPages(['courses', 'courses', 'settings', 'invalid']);
  assert.equal(serialized, '["courses"]');
});