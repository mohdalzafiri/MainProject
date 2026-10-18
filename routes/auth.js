const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db, logSystem, getCurrentTimestamp } = require('../database');
const {
  normalizeRole,
  getEffectiveAllowedPages,
  getEffectiveEditablePages
} = require('../auth/permissions');

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  const raw = String(value || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    }
  } catch {
    return [];
  }

  return [];
}

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const ROUTER_TOKEN_EXPIRY = '8h';
const REFRESH_SESSION_DAYS = 30;

const router = express.Router();

function sendError(res, status, message) {
  return res.status(status).json({ message });
}

function buildSessionUser(user) {
  const role = normalizeRole(user.Permission);
  const isAdmin = role === 'admin';

  return {
    id: user.ID,
    username: user.Username,
    role,
    department: user.Department || '',
    section: user.Section || '',
    subSection: user.SubSection || '',
    allowedPages: getEffectiveAllowedPages(isAdmin, user.AllowedPages),
    editablePages: getEffectiveEditablePages(isAdmin, user.AllowedPages, role === 'view'),
    allowedDepartments: parseJsonArray(user.AllowedDepartments),
    allowedSections: parseJsonArray(user.AllowedSections),
    allowedSubSections: parseJsonArray(user.AllowedSubSections),
    name: user.Name || ''
  };
}

function signAccessToken(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: ROUTER_TOKEN_EXPIRY });
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createBase64UrlToken(byteLength) {
  return crypto.randomBytes(byteLength)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function createRefreshSession(userId) {
  const refreshToken = createBase64UrlToken(48);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + REFRESH_SESSION_DAYS * 24 * 60 * 60 * 1000);

  (await db.prepare(`
    INSERT INTO RefreshSessions (UserID, TokenHash, CreatedAt, ExpiresAt)
    VALUES (?, ?, ?, ?)
  `).run(userId, hashRefreshToken(refreshToken), createdAt.toISOString(), expiresAt.toISOString()));

  return refreshToken;
}

const selectSessionUserSql = `
  SELECT ID, Username, Password, Permission, Department, Section, SubSection,
         AllowedPages, AllowedDepartments, AllowedSections, AllowedSubSections, Name, IsActive
  FROM Login
`;

router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const userAgent = req.headers['user-agent'] || '';

  if (!username || !password) {
    (await logSystem({ action: 'Login Failed', page: 'Login', details: 'Missing username or password', machine: userAgent }));
    return sendError(res, 400, 'يرجى إدخال اسم المستخدم وكلمة المرور');
  }

  try {
    const user = (await db.prepare(`${selectSessionUserSql} WHERE Username = ? COLLATE NOCASE LIMIT 1`).get(username));

    if (!user) {
      (await logSystem({ userName: username, action: 'Login Failed', page: 'Login', details: 'User not found', machine: userAgent }));
      return sendError(res, 401, 'المستخدم غير موجود');
    }

    if (user.Password !== password) {
      (await logSystem({ userName: username, action: 'Login Failed', page: 'Login', details: 'Invalid password', machine: userAgent }));
      return sendError(res, 401, 'كلمة المرور غير صحيحة');
    }

    if (Number(user.IsActive) === 0) {
      (await logSystem({ userName: user.Username, action: 'Login Failed', page: 'Login', details: 'Inactive user', machine: userAgent }));
      return sendError(res, 403, 'تم إيقاف هذا المستخدم من قبل الإدارة');
    }

    const sessionUser = buildSessionUser(user);
    const rememberMe = req.body.rememberMe === true;
    const refreshToken = rememberMe ? (await createRefreshSession(user.ID)) : null;

    (await db.prepare('UPDATE Login SET LastLogin = ? WHERE ID = ?').run(getCurrentTimestamp(), user.ID));
    (await logSystem({ userName: user.Username, role: user.Permission || '', action: 'Login Success', page: 'Login', details: 'User logged in', machine: userAgent }));

    return res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token: signAccessToken(sessionUser),
      refreshToken,
      user: sessionUser
    });
  } catch (error) {
    console.error(error);
    (await logSystem({ userName: username, action: 'Login Error', page: 'Login', details: error.message, machine: userAgent }));
    return sendError(res, 500, 'حدث خطأ أثناء الاتصال بقاعدة البيانات');
  }
});

router.post('/refresh', async (req, res) => {
  const refreshToken = String(req.body.refreshToken || '');
  if (!refreshToken) {
    return sendError(res, 400, 'جلسة التذكر غير متوفرة');
  }

  try {
    const tokenHash = hashRefreshToken(refreshToken);
    const session = (await db.prepare(`
      SELECT RefreshSessions.ID AS SessionID, RefreshSessions.ExpiresAt, Login.*
      FROM RefreshSessions
      JOIN Login ON Login.ID = RefreshSessions.UserID
      WHERE RefreshSessions.TokenHash = ?
      LIMIT 1
    `).get(tokenHash));

    if (!session || session.ExpiresAt <= new Date().toISOString()) {
      (await db.prepare('DELETE FROM RefreshSessions WHERE TokenHash = ?').run(tokenHash));
      return sendError(res, 401, 'انتهت جلسة التذكر، يرجى تسجيل الدخول مجدداً');
    }

    if (Number(session.IsActive) === 0) {
      (await db.prepare('DELETE FROM RefreshSessions WHERE UserID = ?').run(session.ID));
      return sendError(res, 403, 'تم إيقاف هذا المستخدم من قبل الإدارة');
    }

    const newRefreshToken = (await db.transaction(async () => {
      (await db.prepare('DELETE FROM RefreshSessions WHERE ID = ?').run(session.SessionID));
      return (await createRefreshSession(session.ID));
    })());
    const sessionUser = buildSessionUser(session);

    return res.json({
      message: 'تم تجديد الجلسة بنجاح',
      token: signAccessToken(sessionUser),
      refreshToken: newRefreshToken,
      user: sessionUser
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 500, 'تعذر تجديد جلسة الدخول');
  }
});

router.post('/logout', async (req, res) => {
  const refreshToken = String(req.body.refreshToken || '');
  if (refreshToken) {
    (await db.prepare('DELETE FROM RefreshSessions WHERE TokenHash = ?').run(hashRefreshToken(refreshToken)));
  }

  const authHeader = String(req.headers.authorization || '');
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  let sessionUser = null;
  if (accessToken) {
    try {
      sessionUser = jwt.verify(accessToken, JWT_SECRET);
    } catch {
      sessionUser = null;
    }
  }

  await logSystem({
    userName: (sessionUser && sessionUser.username) || 'unknown',
    role: (sessionUser && sessionUser.role) || '',
    action: 'Close',
    page: 'Login',
    details: 'User logged out'
  });

  return res.json({ message: 'تم تسجيل الخروج بنجاح' });
});

module.exports = router;
