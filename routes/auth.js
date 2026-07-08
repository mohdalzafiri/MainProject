const express = require('express');
const jwt = require('jsonwebtoken');
const { db, logSystem } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const ROUTER_TOKEN_EXPIRY = '8h';

const router = express.Router();

function sendError(res, status, message) {
  return res.status(status).json({ message });
}

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const userAgent = req.headers['user-agent'] || '';

  if (!username || !password) {
    logSystem({ action: 'Login Failed', page: 'Login', details: 'Missing username or password', machine: userAgent });
    return sendError(res, 400, 'يرجى إدخال اسم المستخدم وكلمة المرور');
  }

  try {
    const user = db.prepare('SELECT ID, Username, Password, Permission, Department, Section, Name, IsActive FROM Login WHERE Username = ? COLLATE NOCASE LIMIT 1').get(username);

    if (!user) {
      logSystem({ userName: username, action: 'Login Failed', page: 'Login', details: 'User not found', machine: userAgent });
      return sendError(res, 401, 'المستخدم غير موجود');
    }

    if (user.Password !== password) {
      logSystem({ userName: username, action: 'Login Failed', page: 'Login', details: 'Invalid password', machine: userAgent });
      return sendError(res, 401, 'كلمة المرور غير صحيحة');
    }

    if (Number(user.IsActive) === 0) {
      logSystem({ userName: user.Username, action: 'Login Failed', page: 'Login', details: 'Inactive user', machine: userAgent });
      return sendError(res, 403, 'تم إيقاف هذا المستخدم من قبل الإدارة');
    }

    db.prepare('UPDATE Login SET LastLogin = ? WHERE ID = ?').run(new Date().toISOString(), user.ID);
    logSystem({ userName: user.Username, role: user.Permission || '', action: 'Login Success', page: 'Login', details: 'User logged in', machine: userAgent });

    const token = jwt.sign(
      {
        id: user.ID,
        username: user.Username,
        role: user.Permission || '',
        department: user.Department || '',
        section: user.Section || '',
        name: user.Name || ''
      },
      JWT_SECRET,
      { expiresIn: ROUTER_TOKEN_EXPIRY }
    );

    return res.json({
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        username: user.Username,
        role: user.Permission || '',
        department: user.Department || '',
        section: user.Section || '',
        name: user.Name || ''
      }
    });
  } catch (error) {
    console.error(error);
    logSystem({ userName: username, action: 'Login Error', page: 'Login', details: error.message, machine: userAgent });
    return sendError(res, 500, 'حدث خطأ أثناء الاتصال بقاعدة البيانات');
  }
});

module.exports = router;

