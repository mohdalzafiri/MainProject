const jwt = require('jsonwebtoken');
const { getRequestAuditContext } = require('../utils/requestAuditContext');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'غير مصرح. الرجاء تسجيل الدخول.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    const auditContext = getRequestAuditContext();
    if (auditContext) {
      auditContext.userName = String(payload.username || '').trim();
      auditContext.role = String(payload.role || '').trim().toLowerCase();
    }
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'رمز المصادقة غير صالح أو منتهي.' });
  }
}

module.exports = authMiddleware;
