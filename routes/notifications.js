const express = require('express');
const { db } = require('../database');
const { ensureAppNotificationsTable } = require('../services/appNotificationService');

const router = express.Router();
const notificationLimit = 50;

router.get('/', async (req, res) => {
  const rawAfterId = req.query.afterId;
  const afterId = rawAfterId == null ? null : Number(rawAfterId);
  if (afterId !== null && (!Number.isSafeInteger(afterId) || afterId < 0)) {
    return res.status(400).json({ message: 'مؤشر الإشعارات غير صالح.' });
  }

  try {
    await ensureAppNotificationsTable();
    const latest = await db.prepare('SELECT COALESCE(MAX(ID), 0) AS latestId FROM AppNotifications').get();
    const latestId = Number(latest && latest.latestId || 0);
    if (afterId === null) {
      const recent = req.query.recent === '1'
        ? await db.prepare(`
          SELECT ID AS id, Title AS title, Message AS message, CreatedAt AS createdAt
          FROM (
            SELECT ID, Title, Message, CreatedAt
            FROM AppNotifications
            ORDER BY ID DESC
            LIMIT 30
          ) AS recentNotifications
          ORDER BY ID ASC
        `).all()
        : [];
      return res.json({
        notifications: recent.map((notification) => ({ ...notification, id: Number(notification.id) })),
        latestId,
        nextAfterId: latestId,
        hasMore: false
      });
    }

    const rows = await db.prepare(`
      SELECT ID AS id, Title AS title, Message AS message, CreatedAt AS createdAt
      FROM AppNotifications
      WHERE ID > ?
      ORDER BY ID ASC
      LIMIT ?
    `).all(afterId, notificationLimit + 1);
    const hasMore = rows.length > notificationLimit;
    const notifications = rows.slice(0, notificationLimit).map((notification) => ({
      ...notification,
      id: Number(notification.id)
    }));
    const nextAfterId = notifications.length
      ? notifications[notifications.length - 1].id
      : latestId;

    return res.json({
      notifications,
      latestId,
      nextAfterId,
      hasMore
    });
  } catch (error) {
    console.error('Unable to load app notifications:', error);
    return res.status(500).json({ message: 'تعذر تحميل إشعارات التطبيق.' });
  }
});

module.exports = router;
