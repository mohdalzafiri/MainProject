const { AsyncLocalStorage } = require('async_hooks');

const requestAuditStorage = new AsyncLocalStorage();

function isMobileRequest(req) {
  const uiMode = String(req.headers['x-ui-mode'] || '').trim().toLowerCase();
  const referer = String(req.headers.referer || '');
  const userAgent = String(req.headers['user-agent'] || '');

  return uiMode === 'mobile'
    || /\/mobile(?:\/|-dashboard\.html)/i.test(referer)
    || /android|iphone|ipad|ipod|mobile/i.test(userAgent);
}

function runWithRequestAuditContext(req, callback) {
  const context = {
    isMobile: isMobileRequest(req),
    userName: '',
    role: '',
    logged: false
  };

  return requestAuditStorage.run(context, () => callback(context));
}

function getRequestAuditContext() {
  return requestAuditStorage.getStore();
}

module.exports = {
  getRequestAuditContext,
  isMobileRequest,
  runWithRequestAuditContext
};