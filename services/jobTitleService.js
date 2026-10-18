async function ensureJobTitlesTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS JobTitleLookup (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      Title TEXT NOT NULL UNIQUE,
      SortOrder INTEGER NOT NULL DEFAULT 0,
      CreatedAt TEXT NOT NULL,
      UpdatedAt TEXT NOT NULL
    )
  `).run();
}

async function listJobTitles(db) {
  await ensureJobTitlesTable(db);
  return db.prepare('SELECT ID, Title, SortOrder FROM JobTitleLookup ORDER BY SortOrder ASC, ID ASC').all();
}

module.exports = { ensureJobTitlesTable, listJobTitles };