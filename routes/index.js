const express = require('express');
const authRoutes = require('./auth');
const dailyLogsRoutes = require('./dailyLogs');
const evaluationsRoutes = require('./evaluations');
const employeesRoutes = require('./employees');
const attendanceRoutes = require('./attendance');
const holidaysRoutes = require('./holidays');
const coursesRoutes = require('./courses');
const administrativeRoutes = require('./administrative');
const outgoingRoutes = require('./outgoing');
const incomingRoutes = require('./incoming');
const outsideEmployeesRoutes = require('./outsideEmployees');
const dashboardRoutes = require('./dashboard');
const systemLogRoutes = require('./systemLog');
const settingsRoutes = require('./settings');
const wordTemplatesRoutes = require('./wordTemplates');
const authMiddleware = require('../auth/auth');

const router = express.Router();

router.use('/auth', authRoutes);
router.use(authMiddleware);

router.use('/daily-logs', dailyLogsRoutes);
router.use('/evaluations', evaluationsRoutes);
router.use('/employees', employeesRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/holidays', holidaysRoutes);
router.use('/courses', coursesRoutes);
router.use('/administrative', administrativeRoutes);
router.use('/outgoing', outgoingRoutes);
router.use('/incoming', incomingRoutes);
router.use('/outside-employees', outsideEmployeesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/system-log', systemLogRoutes);
router.use('/settings', settingsRoutes);
router.use('/word-templates', wordTemplatesRoutes);

module.exports = router;
