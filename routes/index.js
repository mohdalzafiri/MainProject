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
const attachmentsRoutes = require('./attachments');
const authMiddleware = require('../auth/auth');
const {
	ADMIN_ONLY_PAGE_KEYS,
	normalizeRole,
	getEffectiveAllowedPages
} = require('../auth/permissions');

const router = express.Router();

const routePageKeyMap = {
	'/daily-logs': 'daily',
	'/attendance': 'daily',
	'/evaluations': 'evaluations',
	'/employees': 'employees',
	'/holidays': 'holidays',
	'/courses': 'courses',
	'/administrative/transfers': 'transfers',
	'/administrative': 'administrative',
	'/outgoing': 'outgoing',
	'/incoming': 'incoming',
	'/outside-employees': 'outsideEmployees',
	'/dashboard': 'dashboard',
	'/system-log': 'systemLog',
	'/settings': 'settings',
	'/word-templates': 'administrative'
};

const sharedEmployeesReadAllowedPages = new Set([
	'employees',
	'daily',
	'statistics',
	'holidays',
	'courses',
	'transfers',
	'outsideEmployees',
	'evaluations'
]);

function canAccessEmployeesReadForAllowedPages(req, allowedPages = []) {
	if (!req.path.startsWith('/employees')) {
		return false;
	}

	const method = String(req.method || '').toUpperCase();
	if (method !== 'GET' && method !== 'HEAD') {
		return false;
	}

	const normalizedPath = String(req.path || '').replace(/\/+$/, '');
	const isSharedReadEndpoint = normalizedPath === '/employees' || normalizedPath === '/employees/department-sections';
	if (!isSharedReadEndpoint) {
		return false;
	}

	return allowedPages.some((pageKey) => sharedEmployeesReadAllowedPages.has(pageKey));
}

function attachAccessContext(req, res, next) {
	const normalizedRole = normalizeRole(req.user?.role || '');
	const isAdmin = normalizedRole === 'admin';
	const isViewOnly = normalizedRole === 'view';
	const allowedPages = getEffectiveAllowedPages(isAdmin, req.user?.allowedPages);

	req.user.role = normalizedRole;
	req.user.allowedPages = allowedPages;
	req.access = {
		role: normalizedRole,
		isAdmin,
		isViewOnly,
		allowedPages,
		department: String(req.user?.department || '').trim(),
		section: String(req.user?.section || '').trim(),
		subSection: String(req.user?.subSection || '').trim()
	};

	next();
}

function enforceRouteAccess(req, res, next) {
	const routePath = Object.keys(routePageKeyMap).find((prefix) => req.path.startsWith(prefix));
	if (!routePath) {
		return next();
	}

	const pageKey = routePageKeyMap[routePath];
	const { isAdmin, isViewOnly, allowedPages } = req.access || {};

	if (!isAdmin) {
		if (canAccessEmployeesReadForAllowedPages(req, allowedPages)) {
			return next();
		}

		if (ADMIN_ONLY_PAGE_KEYS.includes(pageKey)) {
			return res.status(403).json({ message: 'هذه الواجهة متاحة للمدير فقط.' });
		}

		if (pageKey !== 'dashboard' && !allowedPages.includes(pageKey)) {
			return res.status(403).json({ message: 'غير مصرح لك بالوصول إلى هذه الواجهة.' });
		}
	}

	if (isViewOnly && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())) {
		return res.status(403).json({ message: 'صلاحيتك الحالية للعرض فقط ولا تسمح بالتعديل.' });
	}

	return next();
}

router.use('/auth', authRoutes);
router.use(authMiddleware);
router.use(attachAccessContext);
router.use(enforceRouteAccess);

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
router.use('/attachments', attachmentsRoutes);

module.exports = router;
