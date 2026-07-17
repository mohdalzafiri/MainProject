const ROLE_ADMIN = 'admin';
const ROLE_USER = 'user';
const ROLE_VIEW_ONLY = 'view';

const ADMIN_ONLY_PAGE_KEYS = ['settings', 'administrative', 'systemLog', 'evaluations'];
const CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS = [
  'employees',
  'daily',
  'statistics',
  'holidays',
  'courses',
  'transfers',
  'outsideEmployees',
  'outgoing',
  'incoming'
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
    statistics: 'statistics',
    holidays: 'holidays',
    courses: 'courses',
    transfers: 'transfers',
    outsideemployees: 'outsideEmployees',
    outgoing: 'outgoing',
    incoming: 'incoming',
    settings: 'settings',
    administrative: 'administrative',
    systemlog: 'systemLog',
    evaluations: 'evaluations',
    dashboard: 'dashboard'
  };

  return aliases[normalized] || '';
}

function parseAllowedPages(value) {
  if (Array.isArray(value)) {
    return value.map(normalizePageKey).filter(Boolean);
  }

  const raw = String(value || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(normalizePageKey).filter(Boolean);
    }
  } catch {
    // Fallback for comma-separated legacy values.
  }

  return raw
    .split(',')
    .map((item) => normalizePageKey(item))
    .filter(Boolean);
}

function getEffectiveAllowedPages(isAdmin, allowedPages) {
  if (isAdmin) {
    return [...CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS, ...ADMIN_ONLY_PAGE_KEYS, 'dashboard'];
  }

  const parsed = parseAllowedPages(allowedPages);
  return [...new Set(parsed.filter((key) => CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS.includes(key)))];
}

function serializeAllowedPages(allowedPages) {
  const normalized = parseAllowedPages(allowedPages).filter((key) => CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS.includes(key));
  return JSON.stringify([...new Set(normalized)]);
}

module.exports = {
  ROLE_ADMIN,
  ROLE_USER,
  ROLE_VIEW_ONLY,
  ADMIN_ONLY_PAGE_KEYS,
  CUSTOMIZABLE_NON_ADMIN_PAGE_KEYS,
  normalizeRole,
  normalizePageKey,
  parseAllowedPages,
  getEffectiveAllowedPages,
  serializeAllowedPages
};
