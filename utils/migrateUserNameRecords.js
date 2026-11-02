const USER_NAME_TABLES = [
  'SystemLog',
  'Transfer',
  'Holiday',
  'Course',
  'Reduction',
  'IncomingDocuments',
  'OutgoingDocuments',
  'DepartmentMail'
];

async function migrateUserNameRecords(db) {
  const users = await db.prepare(`
    SELECT Username, Name
    FROM Login
    WHERE Username IS NOT NULL AND Name IS NOT NULL
  `).all();
  const usernames = new Set(users.map((user) => String(user.Username || '').trim()).filter(Boolean));
  const usersByName = new Map();

  users.forEach((user) => {
    const name = String(user.Name || '').trim();
    const username = String(user.Username || '').trim();
    if (!name || !username) return;
    const matches = usersByName.get(name) || [];
    matches.push(username);
    usersByName.set(name, matches);
  });

  const mappings = [];
  usersByName.forEach((matches, name) => {
    if (matches.length !== 1) return;
    const username = matches[0];
    if (name !== username && usernames.has(name)) return;
    if (name !== username) mappings.push({ name, username });
  });

  return db.transaction(async () => {
    let updatedRecords = 0;
    for (const table of USER_NAME_TABLES) {
      for (const { name, username } of mappings) {
        const result = await db.prepare(
          `UPDATE ${table} SET UserName = ? WHERE TRIM(UserName) = ?`
        ).run(username, name);
        updatedRecords += Number(result.changes) || 0;
      }
    }
    return updatedRecords;
  })();
}

module.exports = {
  USER_NAME_TABLES,
  migrateUserNameRecords
};
