const express = require('express');
const authRoutes = require('./auth');
const dailyLogsRoutes = require('./dailyLogs');
const evaluationsRoutes = require('./evaluations');
const employeesRoutes = require('./employees');
const attendanceRoutes = require('./attendance');
const holidaysRoutes = require('./holidays');
const coursesRoutes = require('./courses');
const administrativeRoutes = require('./administrative');
const outsideEmployeesRoutes = require('./outsideEmployees');
const dashboardRoutes = require('./dashboard');
const systemLogRoutes = require('./systemLog');
const settingsRoutes = require('./settings');
const authMiddleware = require('../auth/auth');
const { logSystem } = require('../database');

const router = express.Router();

router.use('/auth', authRoutes);
router.use(authMiddleware);

router.use((req, res, next) => {
	if (req.method !== 'GET') {
		return next();
	}

	const startedAt = Date.now();
	res.on('finish', () => {
		if (res.statusCode >= 400) {
			return;
		}

		const userName = String(req.user?.username || req.user?.userName || '').trim() || 'system';
		const role = String(req.user?.role || '').trim();
		const apiPath = String(req.originalUrl || req.url || '').split('?')[0] || '/';
		const queryText = new URLSearchParams(req.query || {}).toString();
		const details = queryText
			? `GET ${apiPath} ? ${queryText} (${Date.now() - startedAt}ms)`
			: `GET ${apiPath} (${Date.now() - startedAt}ms)`;

		logSystem({
			userName,
			role,
			action: 'View',
			page: 'API',
			target: apiPath,
			details,
			machine: req.headers['user-agent'] || ''
		});
	});

	return next();
});

router.use('/daily-logs', dailyLogsRoutes);
router.use('/evaluations', evaluationsRoutes);
router.use('/employees', employeesRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/holidays', holidaysRoutes);
router.use('/courses', coursesRoutes);
router.use('/administrative', administrativeRoutes);
router.use('/outside-employees', outsideEmployeesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/system-log', systemLogRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
