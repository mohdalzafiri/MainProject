const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getRequestAuditContext,
  isMobileRequest,
  runWithRequestAuditContext
} = require('../utils/requestAuditContext');

test('detects explicit, routed, and user-agent mobile requests', () => {
  assert.equal(isMobileRequest({ headers: { 'x-ui-mode': 'mobile' } }), true);
  assert.equal(isMobileRequest({ headers: { referer: 'https://example.test/mobile/employees.html' } }), true);
  assert.equal(isMobileRequest({ headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' } }), true);
  assert.equal(isMobileRequest({ headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0)' } }), false);
});

test('keeps mobile audit state scoped to the active request', async () => {
  const req = { headers: { 'x-ui-mode': 'mobile' } };

  await runWithRequestAuditContext(req, async (context) => {
    context.userName = 'admin';
    assert.equal(getRequestAuditContext(), context);
    assert.equal(getRequestAuditContext().userName, 'admin');
  });

  assert.equal(getRequestAuditContext(), undefined);
});