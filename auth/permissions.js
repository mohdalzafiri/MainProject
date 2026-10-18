const ROLE_ADMIN = 'admin';
const ROLE_USER = 'user';
const ROLE_VIEW_ONLY = 'view';
const EDIT_PERMISSION_PREFIX = 'edit:';
const PAGE_EDITS_CONFIGURED = 'pageEditsConfigured';

const ADMIN_ONLY_PAGE_KEYS = ['settings', 'administrative', 'systemLog', 'evaluations'];
const CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS = [
  'employees',
  'daily',
  'query',
  'statistics',
  'holidays',
  'reduction',
  'courses',
  'transfers',
  'outsideEmployees',
  'outgoing',
  'incoming',
  'archive',
  'confidentialBooks'
];

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'admin') return ROLE_ADMIN;
  if (role === 'view' || role === 'viewonly' || role === 'read' || role === 'readonly') return ROLE_VIEW_ONLY;
  return ROLE_USER;
}

function normalizePageKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';

  const normalized = key.toLowerCase().replace(/[\s_-]+/g, '');
  const aliases = {
    employees: 'employees',
    daily: 'daily',
    dailylogs: 'daily',
    query: 'query',
    statistics: 'statistics',
    holidays: 'holidays',
    reduction: 'reduction',
    workreduction: 'reduction',
    courses: 'courses',
    transfers: 'transfers',
    outsideemployees: 'outsideEmployees',
    outgoing: 'outgoing',
    incoming: 'incoming',
    archive: 'archive',
    confidentialbooks: 'confidentialBooks',
    settings: 'settings',
    administrative: 'administrative',
    systemlog: 'systemLog',
    evaluations: 'evaluations',
    dashboard: 'dashboard'
  };

  return aliases[normalized] || '';
}

function parseStoredTokens(value) {
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
    // Fallback for comma-separated legacy values.
  }

  return raw
    .split(',')
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function parseStoredPagePermissions(value) {
  const tokens = parseStoredTokens(value);
  const allowedPages = [];
  const editablePages = [];
  let editsConfigured = false;

  tokens.forEach((token) => {
    if (token === PAGE_EDITS_CONFIGURED) {
      editsConfigured = true;
      return;
    }

    if (token.startsWith(EDIT_PERMISSION_PREFIX)) {
      const pageKey = normalizePageKey(token.slice(EDIT_PERMISSION_PREFIX.length));
      if (pageKey && CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS.includes(pageKey)) {
        editablePages.push(pageKey);
      }
      return;
    }

    const pageKey = normalizePageKey(token);
    if (pageKey && CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS.includes(pageKey)) {
      allowedPages.push(pageKey);
    }
  });

  const uniqueAllowedPages = [...new Set(allowedPages)];
  const effectiveEditablePages = editsConfigured
    ? editablePages.filter((pageKey) => uniqueAllowedPages.includes(pageKey))
    : uniqueAllowedPages;

  return {
    allowedPages: uniqueAllowedPages,
    editablePages: [...new Set(effectiveEditablePages)],
    editsConfigured
  };
}

function parseAllowedPages(value) {
  return parseStoredPagePermissions(value).allowedPages;
}

function getEffectiveAllowedPages(isAdmin, allowedPages) {
  if (isAdmin) {
    return [...CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS, ...ADMIN_ONLY_PAGE_KEYS, 'dashboard'];
  }

  const parsed = parseAllowedPages(allowedPages);
  return [...new Set(parsed.filter((key) => CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS.includes(key)))];
}

function getEffectiveEditablePages(isAdmin, allowedPages, isViewOnly = false) {
  if (isAdmin) {
    return [...CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS, ...ADMIN_ONLY_PAGE_KEYS];
  }

  if (isViewOnly) {
    return [];
  }

  return parseStoredPagePermissions(allowedPages).editablePages;
}

function serializeAllowedPages(allowedPages) {
  const normalized = parseAllowedPages(allowedPages).filter((key) => CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS.includes(key));
  return JSON.stringify([...new Set(normalized)]);
}

function serializePagePermissions(allowedPages, editablePages) {
  const normalizedAllowedPages = getEffectiveAllowedPages(false, allowedPages);
  const allowedSet = new Set(normalizedAllowedPages);
  const normalizedEditablePages = parseAllowedPages(editablePages)
    .filter((pageKey) => allowedSet.has(pageKey));
  const editTokens = [...new Set(normalizedEditablePages)]
    .map((pageKey) => `${EDIT_PERMISSION_PREFIX}${pageKey}`);

  return JSON.stringify([...normalizedAllowedPages, PAGE_EDITS_CONFIGURED, ...editTokens]);
}

module.exports = {
  ROLE_ADMIN,
  ROLE_USER,
  ROLE_VIEW_ONLY,
  EDIT_PERMISSION_PREFIX,
  PAGE_EDITS_CONFIGURED,
  ADMIN_ONLY_PAGE_KEYS,
  CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS,
  normalizeRole,
  normalizePageKey,
  parseAllowedPages,
  parseStoredPagePermissions,
  getEffectiveAllowedPages,
  getEffectiveEditablePages,
  serializeAllowedPages,
  serializePagePermissions
};
