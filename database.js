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
      IsActive INTEGER NOT NULL DEFAULT 1,
      CreatedAt TEXT,
      UpdatedAt TEXT,
      LastLogin TEXT
    )
  `).run();

  ensureColumn('Login', 'IsActive', 'INTEGER', '1');
  ensureColumn('Login', 'CreatedAt', 'TEXT');
  ensureColumn('Login', 'UpdatedAt', 'TEXT');

  const timestamp = getCurrentTimestamp();
  db.prepare(`
    UPDATE Login
    SET CreatedAt = COALESCE(NULLIF(TRIM(CreatedAt), ''), ?),
        UpdatedAt = COALESCE(NULLIF(TRIM(UpdatedAt), ''), ?),
        IsActive = COALESCE(IsActive, 1)
  `).run(timestamp, timestamp);

  const usersCount = db.prepare('SELECT COUNT(*) AS count FROM Login').get().count;
  if (usersCount === 0) {
    db.prepare(`
      INSERT INTO Login (Username, Password, Permission, Department, Section, Name, IsActive, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run('admin', 'admin', 'Admin', '', '', 'System Administrator', timestamp, timestamp);
  }
}

function ensureDepartmentSectionLookupTable() {
  const lookupTableExists = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'DepartmentSectionLookup' LIMIT 1").get();

  if (!lookupTableExists) {
    db.prepare(`
      CREATE TABLE DepartmentSectionLookup (
        ID INTEGER PRIMARY KEY AUTOINCREMENT,
        Department TEXT NOT NULL,
        Section TEXT NOT NULL,
        SubSection TEXT NOT NULL DEFAULT '',
        SortOrder INTEGER NOT NULL DEFAULT 0,
        IsActive INTEGER NOT NULL DEFAULT 1,
        CreatedAt TEXT NOT NULL,
        UpdatedAt TEXT NOT NULL,
        UNIQUE(Department, Section, SubSection)
      )
    `).run();
  } else {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier('DepartmentSectionLookup')})`).all();
    const hasSubSection = columns.some((column) => String(column.name || '').toLowerCase() === 'subsection');

    if (!hasSubSection) {
      db.prepare(`
        CREATE TABLE DepartmentSectionLookup_New (
          ID INTEGER PRIMARY KEY AUTOINCREMENT,
          Department TEXT NOT NULL,
          Section TEXT NOT NULL,
          SubSection TEXT NOT NULL DEFAULT '',
          SortOrder INTEGER NOT NULL DEFAULT 0,
          IsActive INTEGER NOT NULL DEFAULT 1,
          CreatedAt TEXT NOT NULL,
          UpdatedAt TEXT NOT NULL,
          UNIQUE(Department, Section, SubSection)
        )
      `).run();

      db.prepare(`
        INSERT INTO DepartmentSectionLookup_New (ID, Department, Section, SubSection, SortOrder, IsActive, CreatedAt, UpdatedAt)
        SELECT ID, Department, Section, '', SortOrder, IsActive, CreatedAt, UpdatedAt
        FROM DepartmentSectionLookup
      `).run();

      db.prepare('DROP TABLE DepartmentSectionLookup').run();
      db.prepare('ALTER TABLE DepartmentSectionLookup_New RENAME TO DepartmentSectionLookup').run();
    }
  }

  const seedDefaults = [
    ['البلاغات', 'أ - البلاغات', ''],
    ['البلاغات', 'ب - البلاغات', ''],
    ['البلاغات', 'ج - البلاغات', ''],
    ['البلاغات', 'د - البلاغات', ''],
    ['البلاغات', 'هـ - البلاغات', ''],
    ['البلاغات', 'ثابت صبح', ''],
    ['البلاغات', 'أ - فريق عمل البلاغات', ''],
    ['البلاغات', 'ب - فريق عمل البلاغات', ''],
    ['البلاغات', 'ج - فريق عمل البلاغات', ''],
    ['البلاغات', 'د - فريق عمل البلاغات', ''],
    ['البلاغات', 'فريق عمل البلاغات صباحاً', ''],
    ['البلاغات', 'سكرتارية البلاغات', ''],
    ['العمليات', 'أ - العمليات', ''],
    ['العمليات', 'ب - العمليات', ''],
    ['العمليات', 'ج - العمليات', ''],
    ['العمليات', 'د - العمليات', ''],
    ['العمليات', 'هـ - العمليات', ''],
    ['العمليات', 'سكرتارية العمليات', ''],
    ['الخدمات المساندة', 'أ - الخدمات', ''],
    ['الخدمات المساندة', 'ب - الخدمات', ''],
    ['الخدمات المساندة', 'ج - الخدمات', ''],
    ['الخدمات المساندة', 'د - الخدمات', ''],
    ['الموارد البشرية', 'صباحاً', ''],
    ['المعلومات', 'صباحاً', ''],
    ['الاحصاء', 'صباحاً', '']
  ];

  const seedRows = [];
  const hasMainTable = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'Main' LIMIT 1").get();
  if (hasMainTable) {
    const mainRows = db.prepare(`
      SELECT DISTINCT TRIM(Department) AS Department, TRIM(Section) AS Section
      FROM Main
      WHERE TRIM(Department) <> '' AND TRIM(Section) <> ''
    `).all();

    mainRows.forEach((row) => {
      const department = String(row.Department || '').trim() === 'الإحصاء' ? 'الاحصاء' : String(row.Department || '').trim();
      const section = String(row.Section || '').trim();
      if (department && section) {
        seedRows.push([department, section, '']);
      }
    });
  }

  seedDefaults.forEach((item) => seedRows.push(item));

  const insert = db.prepare(`
    INSERT OR IGNORE INTO DepartmentSectionLookup (Department, Section, SubSection, SortOrder, IsActive, CreatedAt, UpdatedAt)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `);

  seedRows.forEach(([department, section, subSection], index) => {
    const normalizedDepartment = String(department || '').trim();
    const normalizedSection = String(section || '').trim();
    const normalizedSubSection = String(subSection || '').trim();
    if (!normalizedDepartment || !normalizedSection) return;
    const timestamp = getCurrentTimestamp();
    insert.run(normalizedDepartment, normalizedSection, normalizedSubSection, index + 1, timestamp, timestamp);
  });
}

function ensureColumn(tableName, columnName, columnType, defaultSql = '') {
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
  const hasColumn = columns.some((column) => String(column.name || '').toLowerCase() === String(columnName || '').toLowerCase());
  if (hasColumn) return;

  const defaultClause = defaultSql ? ` DEFAULT ${defaultSql}` : '';
  db.prepare(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${columnType}${defaultClause}`).run();
}

function ensureWorkflowSubSectionColumns() {
  const existingTables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => row.name);

  const tableSet = new Set(existingTables);

  if (tableSet.has('Main')) {
    ensureColumn('Main', 'SubSection', 'TEXT', "''");
  }

  if (tableSet.has('Transfer')) {
    ensureColumn('Transfer', 'SubSection', 'TEXT', "''");
    ensureColumn('Transfer', 'SubSection1', 'TEXT', "''");
  }

  for (const tableName of dailyTables) {
    if (tableSet.has(tableName)) {
      ensureColumn(tableName, 'SubSection', 'TEXT', "''");
    }
  }

  const hasDailyAllView = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'view' AND name = 'DailyAll' LIMIT 1").get();
  if (hasDailyAllView) {
    db.prepare('DROP VIEW DailyAll').run();
  }

  db.prepare(`
    CREATE VIEW IF NOT EXISTS DailyAll AS
    SELECT ID, EmpID, Day, Today, Name, Department, Section, SubSection, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note FROM Daily1
    UNION ALL
    SELECT ID, EmpID, Day, Today, Name, Department, Section, SubSection, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note FROM Daily2
    UNION ALL
    SELECT ID, EmpID, Day, Today, Name, Department, Section, SubSection, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note FROM Daily3
    UNION ALL
    SELECT ID, EmpID, Day, Today, Name, Department, Section, SubSection, Status, Period, InTime, OutTime, Startdate, Enddate, Type, Note FROM Daily4
  `).run();
}

function ensureAdministrativeFormsTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS AdministrativeForms (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      FormDate TEXT NOT NULL,
      DayName TEXT NOT NULL,
      FormName TEXT NOT NULL,
      EmpID TEXT,
      EmployeeName TEXT NOT NULL,
      Department TEXT NOT NULL,
      Section TEXT NOT NULL,
      Notes TEXT,
      CreatedAt TEXT NOT NULL,
      CreatedBy TEXT
    )
  `).run();
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

function logSystem({ userName = '', role = '', action = '', target = '', page = '', details = '', machine = '', appVersion = '' } = {}) {
  try {
    const stmt = db.prepare(`INSERT INTO SystemLog (Timestamp, UserName, Role, Action, Target, Details, Machine, AppVersion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(getCurrentTimestamp(), userName, role, action, target || page, details, machine, appVersion);
  } catch (error) {
    // Do not block business flow if audit logging fails.
    console.warn('SystemLog insert skipped:', error.message);
  }
}

ensureSystemLogTable();
ensureLoginTable();
ensureDepartmentSectionLookupTable();
ensureWorkflowSubSectionColumns();
ensureAdministrativeFormsTable();
normalizeDepartmentNames();

console.log(`Database path: ${dbPath}`);

module.exports = {
  db,
  dailyTables,
  isValidDailyTable,
  logSystem,
};
