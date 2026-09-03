const DEFAULT_ARCHIVE_CATEGORIES = [
  { key: 'circulars', labelAr: 'التعاميم', sortOrder: 1 },
  { key: 'statements', labelAr: 'الكشوف', sortOrder: 2 },
  { key: 'forms', labelAr: 'النماذج', sortOrder: 3 }
];

const LEGACY_CATEGORY_ALIASES = {
  general: 'circulars',
  reports: 'statements'
};

function ensureArchiveCategoriesTable(db, getCurrentTimestamp) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS ArchiveCategories (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      KeyName TEXT NOT NULL UNIQUE,
      LabelAr TEXT NOT NULL UNIQUE,
      SortOrder INTEGER NOT NULL DEFAULT 0,
      IsActive INTEGER NOT NULL DEFAULT 1,
      CreatedAt TEXT NOT NULL,
      UpdatedAt TEXT NOT NULL
    )
  `).run();

  const columns = db.prepare('PRAGMA table_info(ArchiveCategories)').all();
  if (!columns.some((column) => String(column.name).toLowerCase() === 'parentid')) {
    db.prepare('ALTER TABLE ArchiveCategories ADD COLUMN ParentID INTEGER').run();
  }

  const timestamp = getCurrentTimestamp();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO ArchiveCategories
      (KeyName, LabelAr, SortOrder, IsActive, CreatedAt, UpdatedAt)
    VALUES (?, ?, ?, 1, ?, ?)
  `);

  const seedDefaults = db.transaction(() => {
    DEFAULT_ARCHIVE_CATEGORIES.forEach((category) => {
      insert.run(category.key, category.labelAr, category.sortOrder, timestamp, timestamp);
    });
  });
  seedDefaults();
}

function normalizeCategoryKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  return LEGACY_CATEGORY_ALIASES[raw] || raw;
}

function listArchiveCategories(db, { includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE category.IsActive = 1';
  return db.prepare(`
    SELECT category.ID, category.KeyName, category.LabelAr, category.ParentID,
           parent.KeyName AS ParentKeyName, parent.LabelAr AS ParentLabelAr,
           category.SortOrder, category.IsActive, category.CreatedAt, category.UpdatedAt
    FROM ArchiveCategories AS category
    LEFT JOIN ArchiveCategories AS parent ON parent.ID = category.ParentID
    ${where}
    ORDER BY category.SortOrder ASC, category.ID ASC
  `).all();
}

function getArchiveCategory(db, value, { includeInactive = false } = {}) {
  const key = normalizeCategoryKey(value);
  if (!key) return null;
  const activeClause = includeInactive ? '' : 'AND category.IsActive = 1';
  return db.prepare(`
    SELECT category.ID, category.KeyName, category.LabelAr, category.ParentID,
           parent.KeyName AS ParentKeyName, parent.LabelAr AS ParentLabelAr,
           category.SortOrder, category.IsActive, category.CreatedAt, category.UpdatedAt
    FROM ArchiveCategories AS category
    LEFT JOIN ArchiveCategories AS parent ON parent.ID = category.ParentID
    WHERE category.KeyName = ? ${activeClause}
    LIMIT 1
  `).get(key) || null;
}

function getArchiveCategoryPath(db, value) {
  const parts = [];
  const visited = new Set();
  let category = getArchiveCategory(db, value, { includeInactive: true });

  while (category) {
    if (visited.has(category.ID)) {
      throw new Error('Archive category hierarchy contains a cycle.');
    }
    visited.add(category.ID);
    parts.unshift(category.KeyName);
    category = category.ParentID
      ? db.prepare(`
          SELECT ID, KeyName, LabelAr, ParentID, SortOrder, IsActive, CreatedAt, UpdatedAt
          FROM ArchiveCategories WHERE ID = ? LIMIT 1
        `).get(category.ParentID)
      : null;
  }

  return parts;
}

function isValidCategoryKey(value) {
  return /^[a-z][a-z0-9-]{1,39}$/.test(String(value || '').trim());
}

module.exports = {
  DEFAULT_ARCHIVE_CATEGORIES,
  LEGACY_CATEGORY_ALIASES,
  ensureArchiveCategoriesTable,
  normalizeCategoryKey,
  listArchiveCategories,
  getArchiveCategory,
  getArchiveCategoryPath,
  isValidCategoryKey
};
