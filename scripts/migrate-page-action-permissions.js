/**
 * One-time migration for per-page view/edit permissions.
 *
 * Existing page access remains viewable and editable. The former statistics
 * permission is moved to query when the account has not been migrated yet.
 *
 * Usage:
 *   node scripts/migrate-page-action-permissions.js
 *   node scripts/migrate-page-action-permissions.js --apply
 */

const path = require('path');
const Database = require('better-sqlite3');
const {
  normalizeRole,
  parseStoredPagePermissions,
  serializePagePermissions
} = require('../auth/permissions');

const apply = process.argv.includes('--apply');
const databasePath = process.env.DATABASE_PATH || path.join('\\\\PC-SERVER', 'Database', 'database.db');
const db = new Database(databasePath, { readonly: !apply, fileMustExist: true, timeout: 15000 });

function migrateLegacyStatistics(allowedPages, editsConfigured) {
  if (editsConfigured || !allowedPages.includes('statistics') || allowedPages.includes('query')) {
    return allowedPages;
  }

  return allowedPages.map((pageKey) => (pageKey === 'statistics' ? 'query' : pageKey));
}

try {
  const rows = db.prepare(`
    SELECT ID, Username, Permission, IFNULL(AllowedPages, '[]') AS AllowedPages
    FROM Login
    ORDER BY ID
  `).all();
  const updates = [];

  rows.forEach((row) => {
    if (normalizeRole(row.Permission) === 'admin') return;

    const parsed = parseStoredPagePermissions(row.AllowedPages);
    const allowedPages = migrateLegacyStatistics(parsed.allowedPages, parsed.editsConfigured);
    const editablePages = parsed.editsConfigured
      ? parsed.editablePages
      : allowedPages;
    const serialized = serializePagePermissions(allowedPages, editablePages);
    const current = String(row.AllowedPages || '').trim() || '[]';

    if (serialized === current) return;

    updates.push({
      id: row.ID,
      username: row.Username,
      before: current,
      after: serialized
    });
  });

  updates.forEach((item) => {
    console.log(`${item.username}: ${item.before} -> ${item.after}`);
  });

  if (!apply) {
    console.log(`\nDry run only. ${updates.length} user(s) would change.`);
  } else if (updates.length > 0) {
    const statement = db.prepare('UPDATE Login SET AllowedPages = ? WHERE ID = ?');
    const migrate = db.transaction((items) => {
      items.forEach((item) => statement.run(item.after, item.id));
    });
    migrate(updates);
    console.log(`\nApplied. ${updates.length} user(s) migrated.`);
  } else {
    console.log('\nNo users require migration.');
  }
} finally {
  db.close();
}
