const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function resolveDatabasePath() {
  const configuredPath = process.env.DB_PATH && process.env.DB_PATH.trim();
  const candidates = [
    'Z:\\database.db',
    configuredPath,
    path.resolve(__dirname, 'database.db'),
    '\\\\PC-SERVER\\Database\\database.db'
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return configuredPath || path.resolve(__dirname, 'database.db');
}

const dbPath = resolveDatabasePath();
const db = new Database(dbPath, { readonly: false });

const dailyTables = ['Daily1', 'Daily2', 'Daily3', 'Daily4'];

function isValidDailyTable(table) {
  return dailyTables.includes(table);
}

function getCurrentTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function ensureSystemLogTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS SystemLog (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Timestamp TEXT NOT NULL,
      UserName TEXT,
      Role TEXT,
      Action TEXT,
      Target TEXT,
      Details TEXT,
      Machine TEXT,
      AppVersion TEXT
    )
  `).run();
}

function ensureLoginTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS Login (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Username TEXT NOT NULL UNIQUE,
      Password TEXT NOT NULL,
      Permission TEXT,
      Department TEXT,
      Section TEXT,
      Name TEXT,
      LastLogin TEXT
    )
  `).run();

  const usersCount = db.prepare('SELECT COUNT(*) AS count FROM Login').get().count;
  if (usersCount === 0) {
    db.prepare(`
      INSERT INTO Login (Username, Password, Permission, Department, Section, Name)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('admin', 'admin', 'Admin', '', '', 'System Administrator');
  }
}

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function normalizeDepartmentNames() {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name);

  for (const tableName of tables) {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
    const hasDepartment = columns.some((column) => String(column.name || '').toLowerCase() === 'department');
    if (!hasDepartment) continue;

    db.prepare(`
      UPDATE ${quoteIdentifier(tableName)}
      SET Department = 'الاحصاء'
      WHERE TRIM(Department) = 'الإحصاء'
    `).run();
  }
}

function logSystem({ userName = '', role = '', action = '', target = '', details = '', machine = '', appVersion = '' } = {}) {
  try {
    const stmt = db.prepare(`INSERT INTO SystemLog (Timestamp, UserName, Role, Action, Target, Details, Machine, AppVersion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(getCurrentTimestamp(), userName, role, action, target, details, machine, appVersion);
  } catch (error) {
    // Do not block business flow if audit logging fails.
    console.warn('SystemLog insert skipped:', error.message);
  }
}

ensureSystemLogTable();
ensureLoginTable();
normalizeDepartmentNames();

console.log(`Database path: ${dbPath}`);

module.exports = {
  db,
  dailyTables,
  isValidDailyTable,
  logSystem,
};
