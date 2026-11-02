const { db, initializationPromise, registerDatabaseInitializer } = require('../database');

let appNotificationsTablePromise;
async function ensureAppNotificationsTable() {
  if (!appNotificationsTablePromise) {
    appNotificationsTablePromise = initializationPromise
      .then(() => db.prepare(`
        CREATE TABLE IF NOT EXISTS AppNotifications (
          ID INTEGER PRIMARY KEY AUTOINCREMENT,
          Title TEXT NOT NULL,
          Message TEXT NOT NULL,
          CreatedAt TEXT NOT NULL
        )
      `).run())
      .catch((error) => {
        appNotificationsTablePromise = null;
        throw error;
      });
  }
  await appNotificationsTablePromise;
}

registerDatabaseInitializer(ensureAppNotificationsTable);

async function createAppNotification(title, message) {
  await ensureAppNotificationsTable();
  const createdAt = new Date().toISOString();
  const result = await db.prepare(`
    INSERT INTO AppNotifications (Title, Message, CreatedAt)
    VALUES (?, ?, ?)
  `).run(String(title || '').trim(), String(message || '').trim(), createdAt);

  const retentionDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare('DELETE FROM AppNotifications WHERE CreatedAt < ?').run(retentionDate);
  return Number(result.lastInsertRowid);
}

async function notifyFileUpload(message) {
  try {
    await createAppNotification('تم رفع ملف جديد', message);
  } catch (error) {
    console.error('Unable to create file upload notification:', error);
  }
}

function getUploadNotificationMessage(method, routePath) {
  if (String(method || '').toUpperCase() !== 'POST') return '';

  const path = String(routePath || '');
  if (path === '/archive/upload') {
    return 'تم رفع ملف جديد إلى الأرشيف.';
  }
  if (/^\/attachments\/email-scans\/[^/]+\/\d+$/.test(path)
    || /^\/attachments\/[^/]+\/\d+$/.test(path)
    || /^\/department-mail-scans\/\d+$/.test(path)) {
    return 'تم رفع مستند جديد في البريد الإلكتروني.';
  }
  return '';
}

module.exports = {
  createAppNotification,
  ensureAppNotificationsTable,
  getUploadNotificationMessage,
  notifyFileUpload
};
