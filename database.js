const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function canOpenDatabase(candidatePath) {
  try {
    if (!candidatePath || !fs.existsSync(candidatePath)) return false;
    const probe = new Database(candidatePath, { readonly: true, fileMustExist: true });
    probe.prepare('SELECT 1 AS ok').get();
    probe.close();
    return true;
  } catch {
    return false;
  }
}

function resolveDatabasePath() {
  const configuredPath = process.env.DB_PATH && process.env.DB_PATH.trim();
  const uncPath = '\\\\PC-SERVER\\Database\\database.db';
  const mappedPath = 'Z:\\database.db';
  const localPath = path.resolve(__dirname, 'database.db');

  const normalizedConfiguredPath = configuredPath ? path.normalize(configuredPath).toLowerCase() : '';
  const normalizedUncPath = path.normalize(uncPath).toLowerCase();
  const preferMappedForNetworkDatabase = normalizedConfiguredPath === normalizedUncPath && canOpenDatabase(mappedPath);

  const candidates = [
    preferMappedForNetworkDatabase ? mappedPath : configuredPath,
    preferMappedForNetworkDatabase ? configuredPath : mappedPath,
    uncPath,
    localPath
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (canOpenDatabase(candidate)) {
      return candidate;
    }
  }

  return configuredPath || localPath;
}

const dbPath = resolveDatabasePath();
const db = new Database(dbPath, { readonly: false });

const dailyTables = ['Daily1', 'Daily2', 'Daily3', 'Daily4'];

function isValidDailyTable(table) {
  return dailyTables.includes(table);
}

function getCurrentTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
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
      SubSection TEXT,
      AllowedPages TEXT,
      AllowedDepartments TEXT,
      AllowedSections TEXT,
      AllowedSubSections TEXT,
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
  ensureColumn('Login', 'SubSection', 'TEXT');
  ensureColumn('Login', 'AllowedPages', 'TEXT', "'[]'");
  ensureColumn('Login', 'AllowedDepartments', 'TEXT', "'[]'");
  ensureColumn('Login', 'AllowedSections', 'TEXT', "'[]'");
  ensureColumn('Login', 'AllowedSubSections', 'TEXT', "'[]'");

  const timestamp = getCurrentTimestamp();
  db.prepare(`
    UPDATE Login
    SET CreatedAt = COALESCE(NULLIF(TRIM(CreatedAt), ''), ?),
        UpdatedAt = COALESCE(NULLIF(TRIM(UpdatedAt), ''), ?),
      IsActive = COALESCE(IsActive, 1),
          AllowedPages = COALESCE(NULLIF(TRIM(AllowedPages), ''), '[]'),
          AllowedDepartments = COALESCE(NULLIF(TRIM(AllowedDepartments), ''), '[]'),
          AllowedSections = COALESCE(NULLIF(TRIM(AllowedSections), ''), '[]'),
          AllowedSubSections = COALESCE(NULLIF(TRIM(AllowedSubSections), ''), '[]')
  `).run(timestamp, timestamp);

  const usersCount = db.prepare('SELECT COUNT(*) AS count FROM Login').get().count;
  if (usersCount === 0) {
    db.prepare(`
      INSERT INTO Login (Username, Password, Permission, Department, Section, SubSection, AllowedPages, AllowedDepartments, AllowedSections, AllowedSubSections, Name, IsActive, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run('admin', 'admin', 'Admin', '', '', '', '[]', '[]', '[]', '[]', 'System Administrator', timestamp, timestamp);
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
    ['البلاغات', 'هـ - فريق عمل البلاغات', ''],
    ['البلاغات', 'سكرتارية البلاغات', ''],
    ['البلاغات', 'صباحاً', ''],
    ['العمليات', 'أ - العمليات', ''],
    ['العمليات', 'ب - العمليات', ''],
    ['العمليات', 'ج - العمليات', ''],
    ['العمليات', 'د - العمليات', ''],
    ['العمليات', 'هـ - العمليات', ''],
    ['العمليات', 'سكرتارية العمليات', ''],
    ['العمليات', 'صباحاً', ''],
    ['الخدمات المساندة', 'أ - الخدمات', ''],
    ['الخدمات المساندة', 'ب - الخدمات', ''],
    ['الخدمات المساندة', 'ج - الخدمات', ''],
    ['الخدمات المساندة', 'د - الخدمات', ''],
    ['الخدمات المساندة', 'هـ - الخدمات', ''],
    ['الخدمات المساندة', 'سكرتارية الخدمات', ''],
    ['الخدمات المساندة', 'صباحاً', ''],
    ['الموارد البشرية', 'صباحاً', ''],
    ['المعلومات', 'صباحاً', ''],
    ['الاحصاء', 'صباحاً', '']
  ];

  const canonicalDepartmentSections = {
    'البلاغات': [
      'أ - البلاغات',
      'ب - البلاغات',
      'ج - البلاغات',
      'د - البلاغات',
      'هـ - البلاغات',
      'ثابت صبح',
      'أ - فريق عمل البلاغات',
      'ب - فريق عمل البلاغات',
      'ج - فريق عمل البلاغات',
      'د - فريق عمل البلاغات',
      'هـ - فريق عمل البلاغات',
      'سكرتارية البلاغات',
      'صباحاً'
    ],
    'العمليات': [
      'أ - العمليات',
      'ب - العمليات',
      'ج - العمليات',
      'د - العمليات',
      'هـ - العمليات',
      'سكرتارية العمليات',
      'صباحاً'
    ],
    'الخدمات المساندة': [
      'أ - الخدمات',
      'ب - الخدمات',
      'ج - الخدمات',
      'د - الخدمات',
      'هـ - الخدمات',
      'سكرتارية الخدمات',
      'صباحاً'
    ]
  };

  const timestamp = getCurrentTimestamp();
  const totalRows = db.prepare('SELECT COUNT(*) AS count FROM DepartmentSectionLookup').get().count;

  db.prepare(`
    UPDATE DepartmentSectionLookup
    SET Department = 'الاحصاء', UpdatedAt = ?
    WHERE TRIM(Department) = 'الإحصاء'
  `).run(timestamp);

  if (totalRows === 0) {
    const insert = db.prepare(`
      INSERT INTO DepartmentSectionLookup (Department, Section, SubSection, SortOrder, IsActive, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);

    seedDefaults.forEach(([department, section, subSection], index) => {
      insert.run(department, section, subSection, index + 1, timestamp, timestamp);
    });
  }

  const rowsWithoutSort = db.prepare(`
    SELECT ID
    FROM DepartmentSectionLookup
    WHERE IFNULL(SortOrder, 0) <= 0
    ORDER BY ID ASC
  `).all();

  if (rowsWithoutSort.length) {
    const maxSortOrder = db.prepare('SELECT COALESCE(MAX(SortOrder), 0) AS value FROM DepartmentSectionLookup').get().value;
    const updateSort = db.prepare('UPDATE DepartmentSectionLookup SET SortOrder = ?, UpdatedAt = ? WHERE ID = ?');
    rowsWithoutSort.forEach((row, index) => {
      updateSort.run(maxSortOrder + index + 1, timestamp, row.ID);
    });
  }

  const upsertCanonical = db.prepare(`
    INSERT INTO DepartmentSectionLookup (Department, Section, SubSection, SortOrder, IsActive, CreatedAt, UpdatedAt)
    VALUES (?, ?, '', ?, 1, ?, ?)
    ON CONFLICT(Department, Section, SubSection)
    DO UPDATE SET
      SortOrder = excluded.SortOrder,
      IsActive = 1,
      UpdatedAt = excluded.UpdatedAt
  `);

  const deactivateById = db.prepare('UPDATE DepartmentSectionLookup SET IsActive = 0, UpdatedAt = ? WHERE ID = ?');

  let canonicalSort = 1;
  Object.entries(canonicalDepartmentSections).forEach(([department, sections]) => {
    const canonicalSet = new Set(sections.map((value) => String(value || '').trim()));

    sections.forEach((section) => {
      upsertCanonical.run(department, section, canonicalSort, timestamp, timestamp);
      canonicalSort += 1;
    });

    const existingRows = db.prepare(`
      SELECT ID, TRIM(Section) AS Section, TRIM(IFNULL(SubSection, '')) AS SubSection
      FROM DepartmentSectionLookup
      WHERE TRIM(Department) = ?
    `).all(department);

    existingRows.forEach((row) => {
      if (!row) return;
      const subSection = String(row.SubSection || '').trim();
      const section = String(row.Section || '').trim();
      if (subSection) return;
      if (canonicalSet.has(section)) return;
      deactivateById.run(timestamp, row.ID);
    });
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
      PermitDate TEXT,
      DayName TEXT NOT NULL,
      FormName TEXT NOT NULL,
      EmpID TEXT,
      EmployeeName TEXT NOT NULL,
      Department TEXT NOT NULL,
      SubSection TEXT,
      Section TEXT NOT NULL,
      FromTime TEXT,
      ToTime TEXT,
      PermitReason TEXT,
      LeaveStartDate TEXT,
      LeaveEndDate TEXT,
      LeaveType TEXT,
      Notes TEXT,
      CreatedAt TEXT NOT NULL,
      CreatedBy TEXT
    )
  `).run();

  ensureColumn('AdministrativeForms', 'FromTime', 'TEXT');
  ensureColumn('AdministrativeForms', 'ToTime', 'TEXT');
  ensureColumn('AdministrativeForms', 'PermitDate', 'TEXT');
  ensureColumn('AdministrativeForms', 'SubSection', 'TEXT');
  ensureColumn('AdministrativeForms', 'PermitReason', 'TEXT');
  ensureColumn('AdministrativeForms', 'LeaveStartDate', 'TEXT');
  ensureColumn('AdministrativeForms', 'LeaveEndDate', 'TEXT');
  ensureColumn('AdministrativeForms', 'LeaveType', 'TEXT');
}

function ensureAdministrativeTemplateConfigsTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS AdministrativeTemplateConfigs (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      TemplateName TEXT NOT NULL UNIQUE,
      TemplateFileName TEXT NOT NULL,
      Coordinates TEXT,
      CreatedAt TEXT NOT NULL,
      UpdatedAt TEXT NOT NULL
    )
  `).run();

  ensureColumn('AdministrativeTemplateConfigs', 'Coordinates', 'TEXT');
}

function ensureOutgoingDocumentsTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS OutgoingDocuments (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      DocNumber TEXT NOT NULL,
      DocDate TEXT NOT NULL,
      Subject TEXT NOT NULL,
      Recipient TEXT NOT NULL,
      Notes TEXT,
      UserName TEXT,
      CreatedAt TEXT NOT NULL,
      UpdatedAt TEXT NOT NULL
    )
  `).run();

  ensureColumn('OutgoingDocuments', 'Notes', 'TEXT');
}

function ensureHolidayTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS Holiday (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      EmpID INTEGER,
      Name TEXT,
      Department TEXT,
      Section TEXT,
      Status TEXT,
      Type TEXT,
      Startdate TEXT,
      Enddate TEXT,
      Days INTEGER,
      Note TEXT,
      UserName TEXT
    )
  `).run();

  ensureColumn('Holiday', 'UserName', 'TEXT');
}

function ensureCourseTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS Course (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      EmpID INTEGER,
      Name TEXT,
      Department TEXT,
      Section TEXT,
      Status TEXT,
      CourseName TEXT,
      CourseProvider TEXT,
      Startdate TEXT,
      Enddate TEXT,
      Days INTEGER,
      Note TEXT,
      UserName TEXT
    )
  `).run();

  ensureColumn('Course', 'UserName', 'TEXT');
}

function ensureTransferTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS Transfer (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      EmpID INTEGER,
      Name TEXT,
      Department TEXT,
      Section TEXT,
      SubSection TEXT,
      Status TEXT,
      Department1 TEXT,
      Section1 TEXT,
      SubSection1 TEXT,
      Enddate TEXT,
      Note TEXT,
      UserName TEXT
    )
  `).run();

  ensureColumn('Transfer', 'UserName', 'TEXT');
}

function ensureIncomingDocumentsTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS IncomingDocuments (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      DocNumber TEXT NOT NULL,
      DocDate TEXT NOT NULL,
      BookNumber TEXT NOT NULL,
      BookDate TEXT NOT NULL,
      Subject TEXT NOT NULL,
      SourceDepartment TEXT NOT NULL,
      SpecialDepartment TEXT NOT NULL,
      Notes TEXT,
      UserName TEXT,
      CreatedAt TEXT NOT NULL,
      UpdatedAt TEXT NOT NULL
    )
  `).run();

  ensureColumn('IncomingDocuments', 'Notes', 'TEXT');
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
ensureAdministrativeTemplateConfigsTable();
ensureOutgoingDocumentsTable();
ensureIncomingDocumentsTable();
ensureHolidayTable();
ensureCourseTable();
ensureTransferTable();
normalizeDepartmentNames();

console.log(`Database path: ${dbPath}`);

module.exports = {
  db,
  dailyTables,
  isValidDailyTable,
  getCurrentTimestamp,
  logSystem,
};
