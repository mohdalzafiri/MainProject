const express = require('express');
const authRoutes = require('./auth');
const dailyLogsRoutes = require('./dailyLogs');
const evaluationsRoutes = require('./evaluations');
const employeesRoutes = require('./employees');
const attendanceRoutes = require('./attendance');
const holidaysRoutes = require('./holidays');
const administrativeRoutes = require('./administrative');
const outsideEmployeesRoutes = require('./outsideEmployees');
const dashboardRoutes = require('./dashboard');
const systemLogRoutes = require('./systemLog');
const authMiddleware = require('../auth/auth');

const router = express.Router();

router.use('/auth', authRoutes);
router.use(authMiddleware);
router.use('/daily-logs', dailyLogsRoutes);
router.use('/evaluations', evaluationsRoutes);
router.use('/employees', employeesRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/holidays', holidaysRoutes);
router.use('/administrative', administrativeRoutes);
router.use('/outside-employees', outsideEmployeesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/system-log', systemLogRoutes);

module.exports = router;
