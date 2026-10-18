/**
 * One-time migration: the former "statistics" page became "query".
 * Users holding the legacy "statistics" permission are moved to "query"
 * so they keep access to the page they already used. The new placeholder
 * statistics page stays admin-granted only.
 *
 * Usage:
 *   node scripts/migrate-query-permission.js          (dry run)
 *   node scripts/migrate-query-permission.js --apply  (writes changes)
 */

const path = require('path');
const Database = require('better-sqlite3');

const apply = process.argv.includes('--apply');
const databasePath = process.env.DATABASE_PATH || path.join('\\\\PC-SERVER', 'Database', 'database.db');

function parseAllowedPages(raw) {
  const value = String(raw || '').trim();
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

const db = new Database(databasePath, { readonly: !apply, fileMustExist: true, timeout: 15000 });

try {
  const rows = db.prepare("SELECT ID, Username, IFNULL(AllowedPages, '[]') AS AllowedPages FROM Login").all();
  const updates = [];

  rows.forEach((row) => {
    const pages = parseAllowedPages(row.AllowedPages);
    if (!pages.includes('statistics') || pages.includes('query')) return;

    const migrated = pages.map((page) => (page === 'statistics' ? 'query' : page));
    updates.push({ id: row.ID, username: row.Username, before: pages, after: [...new Set(migrated)] });
  });

  if (updates.length === 0) {
    console.log('No users require migration.');
  } else {
    updates.forEach((item) => {
      console.log(`${item.username}: [${item.before.join(', ')}] -> [${item.after.join(', ')}]`);
    });
  }

  if (!apply) {
    console.log(`\nDry run only. ${updates.length} user(s) would change. Re-run with --apply to write.`);
  } else if (updates.length > 0) {
    const statement = db.prepare('UPDATE Login SET AllowedPages = ? WHERE ID = ?');
    const runAll = db.transaction((items) => {
      items.forEach((item) => statement.run(JSON.stringify(item.after), item.id));
    });
    runAll(updates);
    console.log(`\nApplied. ${updates.length} user(s) migrated.`);
  }
} finally {
  db.close();
}
