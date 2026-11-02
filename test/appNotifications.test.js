const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

test('stores upload notifications and returns them after a client cursor', () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'app-notifications-'));
  const databasePath = path.join(tempDirectory, 'test.db');
  new Database(databasePath).close();

  try {
    const script = `
      const assert = require('node:assert/strict');
      const express = require('express');
      const { closeDatabase } = require('./database');
      const { createAppNotification, getUploadNotificationMessage } = require('./services/appNotificationService');
      const notificationsRoutes = require('./routes/notifications');
      const app = express();
      app.use('/api/notifications', (req, res, next) => next(), notificationsRoutes);
      const server = app.listen(0, '127.0.0.1', async () => {
        try {
          await createAppNotification('تم رفع ملف جديد', 'تم رفع ملف جديد إلى الأرشيف.');
          const historyResponse = await fetch('http://127.0.0.1:' + server.address().port + '/api/notifications?recent=1');
          const historyPayload = await historyResponse.json();
          assert.equal(historyResponse.status, 200);
          assert.equal(historyPayload.notifications.length, 1);
          assert.equal(historyPayload.latestId, historyPayload.notifications[0].id);

          const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/notifications?afterId=0');
          const payload = await response.json();
          assert.equal(response.status, 200);
          assert.equal(payload.notifications.length, 1);
          assert.equal(payload.notifications[0].title, 'تم رفع ملف جديد');
          assert.equal(payload.notifications[0].message, 'تم رفع ملف جديد إلى الأرشيف.');
          assert.equal(payload.notifications[0].id, payload.nextAfterId);
          assert.equal(getUploadNotificationMessage('POST', '/archive/upload'), 'تم رفع ملف جديد إلى الأرشيف.');
          assert.equal(getUploadNotificationMessage('POST', '/attachments/email-scans/incoming/7'), 'تم رفع مستند جديد في البريد الإلكتروني.');
          assert.equal(getUploadNotificationMessage('POST', '/attachments/incoming/7'), 'تم رفع مستند جديد في البريد الإلكتروني.');
          assert.equal(getUploadNotificationMessage('POST', '/department-mail-scans/9'), 'تم رفع مستند جديد في البريد الإلكتروني.');
          assert.equal(getUploadNotificationMessage('DELETE', '/archive/upload'), '');
          assert.equal(getUploadNotificationMessage('POST', '/daily-scans'), '');

          const invalidResponse = await fetch('http://127.0.0.1:' + server.address().port + '/api/notifications?afterId=-1');
          assert.equal(invalidResponse.status, 400);
        } catch (error) {
          console.error(error);
          process.exitCode = 1;
        } finally {
          server.close(async () => {
            await closeDatabase();
          });
        }
      });
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        DB_CLIENT: 'sqlite',
        DB_PATH: databasePath,
        DB_BACKUP_DIR: path.join(tempDirectory, 'backups')
      },
      encoding: 'utf8',
      timeout: 15000
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
});
