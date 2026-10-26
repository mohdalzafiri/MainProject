const express = require('express');
const authRoutes = require('./auth');
const dailyLogsRoutes = require('./dailyLogs');
const evaluationsRoutes = require('./evaluations');
const employeesRoutes = require('./employees');
const attendanceRoutes = require('./attendance');
const holidaysRoutes = require('./holidays');
const reductionRoutes = require('./reduction');
const coursesRoutes = require('./courses');
const administrativeRoutes = require('./administrative');
const outgoingRoutes = require('./outgoing');
const incomingRoutes = require('./incoming');
const departmentMailRoutes = require('./departmentMail');
const outsideEmployeesRoutes = require('./outsideEmployees');
const dashboardRoutes = require('./dashboard');
const systemLogRoutes = require('./systemLog');
const settingsRoutes = require('./settings');
const archiveRoutes = require('./archive');
const wordTemplatesRoutes = require('./wordTemplates');
const attachmentsRoutes = require('./attachments');
const dailyScansRoutes = require('./dailyScans');
const departmentMailScansRoutes = require('./departmentMailScans');
const authMiddleware = require('../auth/auth');
const { logSystem } = require('../database');
const { runWithRequestAuditContext } = require('../utils/requestAuditContext');
const {
	ADMIN_ONLY_PAGE_KEYS,
	normalizeRole,
	getEffectiveAllowedPages,
	getEffectiveEditablePages
} = require('../auth/permissions');

const router = express.Router();

const mobileActionByMethod = {
	GET: 'View',
	HEAD: 'View',
	POST: 'Add',
	PUT: 'Update',
	PATCH: 'Update',
	DELETE: 'Delete'
};

router.use((req, res, next) => {
	runWithRequestAuditContext(req, (auditContext) => {
		res.once('finish', () => {
			if (!auditContext.isMobile || auditContext.logged) return;

			const method = String(req.method || '').toUpperCase();
			const target = String(req.path || '').split('/').filter(Boolean)[0] || 'api';
			void logSystem({
				userName: auditContext.userName || 'unknown',
				role: auditContext.role,
				action: mobileActionByMethod[method] || method,
				target,
				details: `Mobile ${method} ${req.path} status=${res.statusCode}`,
				machine: 'Mobile',
				appVersion: 'mobile-web'
			});
		});

		next();
	});
});

const routePageKeyMap = {
	'/daily-logs': 'daily',
	'/daily-scans': 'daily',
	'/department-mail-scans': 'departmentMail',
	'/attendance': 'daily',
	'/evaluations': 'evaluations',
	'/employees': 'employees',
	'/holidays': 'holidays',
	'/reduction': 'reduction',
	'/courses': 'courses',
	'/administrative/transfers': 'transfers',
	'/administrative': 'administrative',
	'/outgoing': 'outgoing',
	'/incoming': 'incoming',
	'/department-mail': 'departmentMail',
	'/outside-employees': 'outsideEmployees',
	'/dashboard': 'dashboard',
	'/system-log': 'systemLog',
	'/settings': 'settings',
	'/archive': 'archive',
	'/word-templates': 'administrative'
};

function getArchivePageKey(req) {
	if (!req.path.startsWith('/archive')) {
		return '';
	}

	const category = String(
		req.query.category
		|| req.query.key
		|| req.query.parent
		|| ''
	).trim();
	const normalizedPath = String(req.path || '').replace(/\/+$/, '');
	const pathTargetsForceList = normalizedPath.startsWith('/archive/force-list/')
		|| normalizedPath.startsWith('/archive/preview/statements/')
		|| normalizedPath.startsWith('/archive/download/statements/');

	return category === 'statements' || pathTargetsForceList ? 'forceList' : 'archive';
}

const sharedEmployeesReadAllowedPages = new Set([
	'employees',
	'daily',
	'query',
	'statistics',
	'holidays',
	'reduction',
	'courses',
	'transfers',
	'outsideEmployees',
	'departmentMail',
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
	const isSharedReadEndpoint = normalizedPath === '/employees' || normalizedPath === '/employees/department-sections' || normalizedPath === '/employees/job-titles';
	if (!isSharedReadEndpoint) {
		return false;
	}

	return allowedPages.some((pageKey) => sharedEmployeesReadAllowedPages.has(pageKey));
}

function canAccessDailyLogsReadForAllowedPages(req, allowedPages = []) {
	if (!req.path.startsWith('/daily-logs')) {
		return false;
	}

	const method = String(req.method || '').toUpperCase();
	if (method !== 'GET' && method !== 'HEAD') {
		return false;
	}

	return allowedPages.some((pageKey) => ['daily', 'query', 'statistics'].includes(pageKey));
}

function attachAccessContext(req, res, next) {
	const normalizedRole = normalizeRole((req.user && req.user.role) || '');
	const isAdmin = normalizedRole === 'admin';
	const isViewOnly = normalizedRole === 'view';
	const allowedPages = getEffectiveAllowedPages(isAdmin, req.user && req.user.allowedPages);
	const editableSource = Array.isArray(req.user && req.user.editablePages)
		? req.user.editablePages
		: req.user && req.user.allowedPages;
	const editablePages = getEffectiveEditablePages(isAdmin, editableSource, isViewOnly);

	req.user.role = normalizedRole;
	req.user.allowedPages = allowedPages;
	req.user.editablePages = editablePages;
	req.access = {
		role: normalizedRole,
		isAdmin,
		isViewOnly,
		allowedPages,
		editablePages,
		department: String((req.user && req.user.department) || '').trim(),
		section: String((req.user && req.user.section) || '').trim(),
		subSection: String((req.user && req.user.subSection) || '').trim(),
		allowedDepartments: Array.isArray(req.user && req.user.allowedDepartments)
			? req.user.allowedDepartments
			: [],
		allowedSections: Array.isArray(req.user && req.user.allowedSections)
			? req.user.allowedSections
			: [],
		allowedSubSections: Array.isArray(req.user && req.user.allowedSubSections)
			? req.user.allowedSubSections
			: []
	};

	next();
}

function enforceRouteAccess(req, res, next) {
	const routePath = Object.keys(routePageKeyMap).find((prefix) => req.path.startsWith(prefix));
	if (!routePath) {
		return next();
	}

	const pageKey = routePath === '/archive' ? getArchivePageKey(req) : routePageKeyMap[routePath];
	const { isAdmin, isViewOnly, allowedPages, editablePages } = req.access || {};
	const method = String(req.method || '').toUpperCase();
	const isWriteMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

	if (!isAdmin) {
		if (canAccessEmployeesReadForAllowedPages(req, allowedPages)) {
			return next();
		}

		if (canAccessDailyLogsReadForAllowedPages(req, allowedPages)) {
			return next();
		}

		if (ADMIN_ONLY_PAGE_KEYS.includes(pageKey)) {
			return res.status(403).json({ message: 'هذه الواجهة متاحة للمدير فقط.' });
		}

		if (pageKey !== 'dashboard' && !allowedPages.includes(pageKey)) {
			return res.status(403).json({ message: 'غير مصرح لك بالوصول إلى هذه الواجهة.' });
		}

		if (isWriteMethod && (isViewOnly || !editablePages.includes(pageKey))) {
			return res.status(403).json({ message: 'لا تملك صلاحية الإضافة أو التعديل أو الحذف في هذه الواجهة.' });
		}
	}

	return next();
}

router.use('/auth', authRoutes);
router.use(authMiddleware);
router.use(attachAccessContext);
router.use(enforceRouteAccess);

router.use('/daily-logs', dailyLogsRoutes);
router.use('/daily-scans', dailyScansRoutes);
router.use('/department-mail-scans', departmentMailScansRoutes);
router.use('/evaluations', evaluationsRoutes);
router.use('/employees', employeesRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/holidays', holidaysRoutes);
router.use('/reduction', reductionRoutes);
router.use('/courses', coursesRoutes);
router.use('/administrative', administrativeRoutes);
router.use('/outgoing', outgoingRoutes);
router.use('/incoming', incomingRoutes);
router.use('/department-mail', departmentMailRoutes);
router.use('/outside-employees', outsideEmployeesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/system-log', systemLogRoutes);
router.use('/settings', settingsRoutes);
router.use('/archive', archiveRoutes);
router.use('/word-templates', wordTemplatesRoutes);
router.use('/attachments', attachmentsRoutes);

module.exports = router;
