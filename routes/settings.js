const express = require("express");
const fs = require("fs");
const path = require("path");
const { db, dailyTables, logSystem, getCurrentTimestamp, registerDatabaseInitializer } = require("../database");
const { templatesRoot } = require("../services/wordTemplateService");
const { removeSync } = require("../utils/fsCompat");
const {
  DEFAULT_ARCHIVE_CATEGORIES,
  ensureArchiveCategoriesTable,
  listArchiveCategories,
  getArchiveCategoryPath,
  isValidCategoryKey
} = require("../services/archiveCategoryService");
const { listJobTitles } = require("../services/jobTitleService");
const {
  ROLE_VIEW_ONLY,
  normalizeRole,
  serializePagePermissions,
  getEffectiveAllowedPages,
  getEffectiveEditablePages
} = require("../auth/permissions");
const router = express.Router();
registerDatabaseInitializer(() => ensureArchiveCategoriesTable(db, getCurrentTimestamp));
function isAdminUser(req) {
  var _a;
  const role = String(((_a = req.user) == null ? void 0 : _a.role) || "").trim().toLowerCase();
  return role === "admin";
}
function denyIfNotAdmin(req, res) {
  if (!isAdminUser(req)) {
    res.status(403).json({ message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0644\u0643 \u0628\u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u0627\u0644\u0625\u0639\u062F\u0627\u062F\u0627\u062A." });
    return true;
  }
  return false;
}
function normalize(value) {
  return String(value || "").trim();
}
function normalizeJobTitle(value) {
  return normalize(value).replace(/\s+/g, " ");
}
function jobTitleKey(value) {
  return normalizeJobTitle(value).toLocaleLowerCase("ar-KW");
}
function normalizePermission(value) {
  const role = normalizeRole(value);
  if (role === "admin") return "Admin";
  if (role === ROLE_VIEW_ONLY) return "View";
  return "User";
}
function normalizeAllowedPagesInput(allowedPages, editablePages) {
  return serializePagePermissions(
    Array.isArray(allowedPages) ? allowedPages : [],
    Array.isArray(editablePages) ? editablePages : []
  );
}
function normalizeJsonArrayInput(value) {
  if (!Array.isArray(value)) {
    return "[]";
  }
  const clean = value.map((item) => normalize(item)).filter(Boolean);
  return JSON.stringify([...new Set(clean)]);
}
function parseJsonArray(value) {
  const raw = normalize(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => normalize(item)).filter(Boolean);
    }
  } catch {
    return [];
  }
  return [];
}
async function getActiveEmployeeByName(name) {
  const normalizedName = normalize(name);
  if (!normalizedName) return null;
  return db.prepare(`
    SELECT ID, Name, Department, Section, IFNULL(SubSection, '') AS SubSection
    FROM Main
    WHERE TRIM(Status) = 'نشط'
      AND TRIM(Name) = ?
    LIMIT 1
  `).get(normalizedName);
}
function deriveTemplateNameFromFileName(fileName) {
  const raw = normalize(fileName);
  if (!raw) return "";
  return raw.replace(/\.[^.]+$/, "").trim();
}
async function tableExists(name) {
  const row = await db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(name);
  return Boolean(row);
}
function getArchiveRoot() {
  return fs.existsSync("\\\\PC-SERVER\\Database") ? "\\\\PC-SERVER\\Database\\Archive" : path.join(__dirname, "..", "Archive");
}
router.get("/archive-categories", async (req, res) => {
  if (denyIfNotAdmin(req, res)) return;
  try {
    res.json(await listArchiveCategories(db, { includeInactive: true }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0645\u062C\u0644\u062F\u0627\u062A \u0627\u0644\u0623\u0631\u0634\u064A\u0641." });
  }
});
router.post("/archive-categories", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const labelAr = normalize(req.body.LabelAr);
  const keyName = normalize(req.body.KeyName).toLowerCase();
  const parentId = Number(req.body.ParentID || 0) || null;
  if (!labelAr) {
    return res.status(400).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0645\u062C\u0644\u062F \u0628\u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u0645\u0637\u0644\u0648\u0628." });
  }
  if (!isValidCategoryKey(keyName)) {
    return res.status(400).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0645\u062C\u0644\u062F \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A \u064A\u062C\u0628 \u0623\u0646 \u064A\u0628\u062F\u0623 \u0628\u062D\u0631\u0641 \u0648\u064A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 \u0623\u062D\u0631\u0641 \u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629 \u0648\u0623\u0631\u0642\u0627\u0645 \u0648\u0634\u0631\u0637\u0629 \u0641\u0642\u0637." });
  }
  const parent = parentId ? await db.prepare("SELECT ID, KeyName FROM ArchiveCategories WHERE ID = ? AND IsActive = 1 LIMIT 1").get(parentId) : null;
  if (parentId && !parent) {
    return res.status(400).json({ message: "\u0627\u0644\u0645\u062C\u0644\u062F \u0627\u0644\u0623\u0633\u0627\u0633\u064A \u0627\u0644\u0645\u062D\u062F\u062F \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0623\u0648 \u063A\u064A\u0631 \u0646\u0634\u0637." });
  }
  try {
    const timestamp = getCurrentTimestamp();
    const nextSortOrder = (await db.prepare("SELECT COALESCE(MAX(SortOrder), 0) + 1 AS value FROM ArchiveCategories").get()).value;
    const result = await db.prepare(`
      INSERT INTO ArchiveCategories (KeyName, LabelAr, ParentID, SortOrder, IsActive, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(keyName, labelAr, parentId, nextSortOrder, timestamp, timestamp);
    fs.mkdirSync(path.join(getArchiveRoot(), ...await getArchiveCategoryPath(db, keyName)), { recursive: true });
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Add",
      page: "Settings",
      details: `Added archive category ${keyName}`
    });
    res.status(201).json({ ID: result.lastInsertRowid, KeyName: keyName, LabelAr: labelAr, ParentID: parentId });
  } catch (error) {
    console.error(error);
    const message = String(error.message || "").includes("UNIQUE") ? "\u0627\u0633\u0645 \u0627\u0644\u0645\u062C\u0644\u062F \u0627\u0644\u0639\u0631\u0628\u064A \u0623\u0648 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A \u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0633\u0628\u0642\u064B\u0627." : "\u062A\u0639\u0630\u0631 \u0625\u0636\u0627\u0641\u0629 \u0645\u062C\u0644\u062F \u0627\u0644\u0623\u0631\u0634\u064A\u0641.";
    res.status(String(error.message || "").includes("UNIQUE") ? 409 : 500).json({ message });
  }
});
router.delete("/archive-categories/:id", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const id = Number(req.params.id || 0);
  const category = await db.prepare("SELECT ID, KeyName, LabelAr FROM ArchiveCategories WHERE ID = ? LIMIT 1").get(id);
  if (!category) {
    return res.status(404).json({ message: "\u0645\u062C\u0644\u062F \u0627\u0644\u0623\u0631\u0634\u064A\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
  }
  const protectedKeys = new Set(DEFAULT_ARCHIVE_CATEGORIES.map((item) => item.key));
  if (protectedKeys.has(category.KeyName)) {
    return res.status(409).json({ message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u0645\u062C\u0644\u062F\u0627\u062A \u0627\u0644\u0623\u0631\u0634\u064A\u0641 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629." });
  }
  const linkedFiles = (await db.prepare("SELECT COUNT(*) AS count FROM Archive WHERE Category = ?").get(category.KeyName)).count;
  if (linkedFiles > 0) {
    return res.status(409).json({ message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u0627\u0644\u0645\u062C\u0644\u062F \u0644\u0648\u062C\u0648\u062F \u0645\u0644\u0641\u0627\u062A \u0623\u0631\u0634\u064A\u0641 \u062F\u0627\u062E\u0644\u0647." });
  }
  const childFolders = (await db.prepare("SELECT COUNT(*) AS count FROM ArchiveCategories WHERE ParentID = ?").get(category.ID)).count;
  if (childFolders > 0) {
    return res.status(409).json({ message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u0627\u0644\u0645\u062C\u0644\u062F \u0644\u0648\u062C\u0648\u062F \u0645\u062C\u0644\u062F\u0627\u062A \u0641\u0631\u0639\u064A\u0629 \u062F\u0627\u062E\u0644\u0647." });
  }
  try {
    const categoryPath = await getArchiveCategoryPath(db, category.KeyName);
    await db.prepare("DELETE FROM ArchiveCategories WHERE ID = ?").run(id);
    removeSync(path.join(getArchiveRoot(), ...categoryPath), { recursive: true, force: true });
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Delete",
      page: "Settings",
      details: `Deleted archive category ${category.KeyName}`
    });
    res.json({ message: "\u062A\u0645 \u062D\u0630\u0641 \u0645\u062C\u0644\u062F \u0627\u0644\u0623\u0631\u0634\u064A\u0641 \u0628\u0646\u062C\u0627\u062D." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0645\u062C\u0644\u062F \u0627\u0644\u0623\u0631\u0634\u064A\u0641." });
  }
});
router.post("/job-titles", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const title = normalizeJobTitle(req.body.Title);
  if (!title) {
    return res.status(400).json({ message: "المسمى الوظيفي مطلوب." });
  }
  try {
    const existing = (await listJobTitles(db)).some((row) => jobTitleKey(row.Title) === jobTitleKey(title));
    if (existing) {
      return res.status(409).json({ message: "هذا المسمى الوظيفي موجود مسبقًا." });
    }
    const timestamp = getCurrentTimestamp();
    const nextSortOrder = (await db.prepare("SELECT COALESCE(MAX(SortOrder), 0) + 1 AS value FROM JobTitleLookup").get()).value;
    const result = await db.prepare(`
      INSERT INTO JobTitleLookup (Title, SortOrder, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?)
    `).run(title, nextSortOrder, timestamp, timestamp);
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Add",
      page: "Settings",
      details: `Added job title ${title}`
    });
    res.status(201).json({ ID: result.lastInsertRowid, Title: title });
  } catch (error) {
    console.error(error);
    const isDuplicate = String(error.message || "").toUpperCase().includes("UNIQUE");
    res.status(isDuplicate ? 409 : 500).json({
      message: isDuplicate ? "هذا المسمى الوظيفي موجود مسبقًا." : "تعذر إضافة المسمى الوظيفي."
    });
  }
});
router.get("/job-titles", async (req, res) => {
  if (denyIfNotAdmin(req, res)) return;
  try {
    res.json(await listJobTitles(db));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "تعذر تحميل المسميات الوظيفية." });
  }
});
router.put("/job-titles/:id", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const id = Number(req.params.id || 0);
  const title = normalizeJobTitle(req.body.Title);
  if (!id) {
    return res.status(400).json({ message: "معرّف المسمى الوظيفي غير صالح." });
  }
  if (!title) {
    return res.status(400).json({ message: "المسمى الوظيفي مطلوب." });
  }

  const current = await db.prepare("SELECT ID, Title FROM JobTitleLookup WHERE ID = ? LIMIT 1").get(id);
  if (!current) {
    return res.status(404).json({ message: "المسمى الوظيفي غير موجود." });
  }
  const duplicate = (await listJobTitles(db)).some(
    (row) => Number(row.ID) !== id && jobTitleKey(row.Title) === jobTitleKey(title)
  );
  if (duplicate) {
    return res.status(409).json({ message: "هذا المسمى الوظيفي موجود مسبقًا." });
  }

  try {
    const timestamp = getCurrentTimestamp();
    const updateJobTitle = db.transaction(async () => {
      await db.prepare("UPDATE JobTitleLookup SET Title = ?, UpdatedAt = ? WHERE ID = ?").run(title, timestamp, id);
      await db.prepare("UPDATE Main SET Rank = ? WHERE Rank = ?").run(title, current.Title);
    });
    await updateJobTitle();
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Update",
      page: "Settings",
      details: `Updated job title ID=${id} from ${current.Title} to ${title}`
    });
    res.json({ ID: id, Title: title });
  } catch (error) {
    console.error(error);
    const isDuplicate = String(error.message || "").toUpperCase().includes("UNIQUE");
    res.status(isDuplicate ? 409 : 500).json({
      message: isDuplicate ? "هذا المسمى الوظيفي موجود مسبقًا." : "تعذر تعديل المسمى الوظيفي."
    });
  }
});
router.delete("/job-titles/:id", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const id = Number(req.params.id || 0);
  if (!id) {
    return res.status(400).json({ message: "معرّف المسمى الوظيفي غير صالح." });
  }

  const current = await db.prepare("SELECT ID, Title FROM JobTitleLookup WHERE ID = ? LIMIT 1").get(id);
  if (!current) {
    return res.status(404).json({ message: "المسمى الوظيفي غير موجود." });
  }

  try {
    await db.prepare("DELETE FROM JobTitleLookup WHERE ID = ?").run(id);
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Delete",
      page: "Settings",
      details: `Deleted job title ID=${id} title=${current.Title}`
    });
    res.json({ message: "تم حذف المسمى الوظيفي بنجاح." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "تعذر حذف المسمى الوظيفي." });
  }
});
router.get("/department-sections", async (req, res) => {
  if (denyIfNotAdmin(req, res)) return;
  try {
    const rows = await db.prepare(`
      SELECT ID, Department, Section, SubSection, SortOrder, IsActive, CreatedAt, UpdatedAt
      FROM DepartmentSectionLookup
      ORDER BY SortOrder ASC, ID ASC
    `).all();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0648\u0627\u0644\u0646\u0648\u0628\u0627\u062A." });
  }
});
router.post("/department-sections", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const department = normalize(req.body.Department);
  const section = normalize(req.body.Section);
  const subSection = normalize(req.body.SubSection);
  const isActive = Number(req.body.IsActive) === 0 ? 0 : 1;
  if (!department) {
    return res.status(400).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0642\u0633\u0645 \u0645\u0637\u0644\u0648\u0628." });
  }
  if (!section) {
    return res.status(400).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0646\u0648\u0628\u0629 \u0645\u0637\u0644\u0648\u0628." });
  }
  const duplicate = await db.prepare(`
    SELECT ID FROM DepartmentSectionLookup
    WHERE Department = ? AND Section = ? AND IFNULL(SubSection, '') = ?
    LIMIT 1
  `).get(department, section, subSection);
  if (duplicate) {
    return res.status(409).json({ message: "\u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645 \u0645\u0639 \u0647\u0630\u0647 \u0627\u0644\u0646\u0648\u0628\u0629 \u0645\u0648\u062C\u0648\u062F \u0645\u0633\u0628\u0642\u064B\u0627." });
  }
  try {
    const timestamp = getCurrentTimestamp();
    const nextSortOrder = (await db.prepare("SELECT COALESCE(MAX(SortOrder), 0) + 1 AS value FROM DepartmentSectionLookup").get()).value;
    const result = await db.prepare(`
      INSERT INTO DepartmentSectionLookup (Department, Section, SubSection, SortOrder, IsActive, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(department, section, subSection, nextSortOrder, isActive, timestamp, timestamp);
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Add",
      page: "Settings",
      details: `Added department-section ID=${result.lastInsertRowid}`
    });
    res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0642\u0633\u0645 \u0648\u0627\u0644\u0646\u0648\u0628\u0629." });
  }
});
router.put("/department-sections/:id", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D." });
  }
  const department = normalize(req.body.Department);
  const section = normalize(req.body.Section);
  const subSection = normalize(req.body.SubSection);
  const isActive = Number(req.body.IsActive) === 0 ? 0 : 1;
  if (!department) {
    return res.status(400).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0642\u0633\u0645 \u0645\u0637\u0644\u0648\u0628." });
  }
  if (!section) {
    return res.status(400).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0646\u0648\u0628\u0629 \u0645\u0637\u0644\u0648\u0628." });
  }
  const duplicate = await db.prepare(`
    SELECT ID FROM DepartmentSectionLookup
    WHERE Department = ? AND Section = ? AND IFNULL(SubSection, '') = ? AND ID <> ?
    LIMIT 1
  `).get(department, section, subSection, id);
  if (duplicate) {
    return res.status(409).json({ message: "\u064A\u0648\u062C\u062F \u0633\u062C\u0644 \u0622\u062E\u0631 \u0628\u0646\u0641\u0633 \u0627\u0644\u0642\u0633\u0645 \u0648\u0627\u0644\u0646\u0648\u0628\u0629." });
  }
  try {
    const timestamp = getCurrentTimestamp();
    const result = await db.prepare(`
      UPDATE DepartmentSectionLookup
      SET Department = ?, Section = ?, SubSection = ?, IsActive = ?, UpdatedAt = ?
      WHERE ID = ?
    `).run(department, section, subSection, isActive, timestamp, id);
    if (result.changes === 0) {
      return res.status(404).json({ message: "\u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0644\u0644\u062A\u0639\u062F\u064A\u0644." });
    }
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Update",
      page: "Settings",
      details: `Updated department-section ID=${id}`
    });
    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0642\u0633\u0645 \u0648\u0627\u0644\u0646\u0648\u0628\u0629." });
  }
});
router.delete("/department-sections/:id", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D." });
  }
  const target = await db.prepare("SELECT ID, Department, Section, SubSection FROM DepartmentSectionLookup WHERE ID = ? LIMIT 1").get(id);
  if (!target) {
    return res.status(404).json({ message: "\u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0644\u0644\u062D\u0630\u0641." });
  }
  const linkedTableChecks = [
    {
      table: "Main",
      label: "\u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646",
      sql: `SELECT ID FROM Main WHERE TRIM(Department) = ? AND TRIM(Section) = ? AND IFNULL(TRIM(SubSection), '') = ? LIMIT 1`
    },
    {
      table: "Holiday",
      label: "\u0627\u0644\u0625\u062C\u0627\u0632\u0627\u062A",
      sql: `SELECT ID FROM Holiday WHERE TRIM(Department) = ? AND TRIM(Section) = ? LIMIT 1`
    },
    {
      table: "Course",
      label: "\u0627\u0644\u062F\u0648\u0631\u0627\u062A",
      sql: `SELECT ID FROM Course WHERE TRIM(Department) = ? AND TRIM(Section) = ? LIMIT 1`
    },
    {
      table: "Transfer",
      label: "\u0627\u0644\u062A\u0646\u0642\u0644\u0627\u062A",
      sql: `SELECT ID FROM Transfer WHERE (TRIM(Department) = ? AND TRIM(Section) = ? AND IFNULL(TRIM(SubSection), '') = ?) OR (TRIM(Department1) = ? AND TRIM(Section1) = ? AND IFNULL(TRIM(SubSection1), '') = ?) LIMIT 1`,
      args: [target.Department, target.Section, target.SubSection || "", target.Department, target.Section, target.SubSection || ""]
    }
  ];
  dailyTables.forEach((table) => {
    linkedTableChecks.push({
      table,
      label: "\u0627\u0644\u064A\u0648\u0645\u064A\u0627\u062A",
      sql: `SELECT ID FROM ${table} WHERE TRIM(Department) = ? AND TRIM(Section) = ? AND IFNULL(TRIM(SubSection), '') = ? LIMIT 1`
    });
  });
  for (const check of linkedTableChecks) {
    if (!await tableExists(check.table)) {
      continue;
    }
    const linkedRow = await db.prepare(check.sql).get(...check.args || [target.Department, target.Section, target.SubSection || ""]);
    if (linkedRow) {
      return res.status(409).json({ message: `\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0633\u062C\u0644 \u0644\u0648\u062C\u0648\u062F \u0628\u064A\u0627\u0646\u0627\u062A \u0645\u0631\u062A\u0628\u0637\u0629 \u0628\u0647 \u0641\u064A ${check.label}.` });
    }
  }
  try {
    const result = await db.prepare("DELETE FROM DepartmentSectionLookup WHERE ID = ?").run(id);
    if (result.changes === 0) {
      return res.status(404).json({ message: "\u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0644\u0644\u062D\u0630\u0641." });
    }
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Delete",
      page: "Settings",
      details: `Deleted department-section ID=${id}`
    });
    res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0642\u0633\u0645 \u0648\u0627\u0644\u0646\u0648\u0628\u0629." });
  }
});
router.get("/employees-active", async (req, res) => {
  if (denyIfNotAdmin(req, res)) return;
  try {
    const rows = await db.prepare(`
      SELECT ID, Name, Department, Section, IFNULL(SubSection, '') AS SubSection
      FROM Main
      WHERE TRIM(Status) = '\u0646\u0634\u0637' AND TRIM(Name) <> ''
      ORDER BY Name ASC
    `).all();
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646 \u0627\u0644\u0646\u0634\u0637\u064A\u0646." });
  }
});
router.get("/users", async (req, res) => {
  if (denyIfNotAdmin(req, res)) return;
  try {
    const rows = await db.prepare(`
      SELECT ID, Username, Password, Permission, Name, Department, Section, IFNULL(SubSection, '') AS SubSection, IFNULL(AllowedPages, '[]') AS AllowedPages, IFNULL(AllowedDepartments, '[]') AS AllowedDepartments, IFNULL(AllowedSections, '[]') AS AllowedSections, IFNULL(AllowedSubSections, '[]') AS AllowedSubSections, IsActive, CreatedAt, UpdatedAt, LastLogin
      FROM Login
      ORDER BY ID ASC
    `).all();
    const users = rows.map((row) => {
      const normalizedRole = normalizeRole(row.Permission);
      const isAdmin = normalizedRole === "admin";
      return {
        ...row,
        Permission: normalizePermission(row.Permission),
        AllowedPages: getEffectiveAllowedPages(isAdmin, row.AllowedPages),
        EditablePages: getEffectiveEditablePages(isAdmin, row.AllowedPages, normalizedRole === ROLE_VIEW_ONLY),
        AllowedDepartments: parseJsonArray(row.AllowedDepartments),
        AllowedSections: parseJsonArray(row.AllowedSections),
        AllowedSubSections: parseJsonArray(row.AllowedSubSections)
      };
    });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u064A\u0646." });
  }
});
router.post("/users", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const rawPermission = normalize(req.body.Permission);
  const payload = {
    Username: normalize(req.body.Username),
    Password: normalize(req.body.Password),
    Permission: normalizePermission(rawPermission),
    Name: normalize(req.body.Name),
    Department: normalize(req.body.Department),
    SubSection: normalize(req.body.SubSection),
    Section: normalize(req.body.Section),
    AllowedPages: normalizeAllowedPagesInput(req.body.AllowedPages, req.body.EditablePages),
    AllowedDepartments: normalizeJsonArrayInput(req.body.AllowedDepartments),
    AllowedSections: normalizeJsonArrayInput(req.body.AllowedSections),
    AllowedSubSections: "[]",
    IsActive: Number(req.body.IsActive) === 0 ? 0 : 1
  };
  if (!payload.Username) {
    return res.status(400).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0637\u0644\u0648\u0628." });
  }
  if (!payload.Password) {
    return res.status(400).json({ message: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631 \u0645\u0637\u0644\u0648\u0628\u0629." });
  }
  if (!rawPermission) {
    return res.status(400).json({ message: "\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629 \u0645\u0637\u0644\u0648\u0628\u0629." });
  }
  const linkedEmployee = await getActiveEmployeeByName(payload.Name);
  if (!linkedEmployee) {
    return res.status(400).json({ message: "\u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0633\u0645 \u0645\u0648\u0638\u0641 \u0646\u0634\u0637 \u0645\u0646 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646." });
  }
  payload.Name = normalize(linkedEmployee.Name);
  payload.Department = normalize(linkedEmployee.Department);
  payload.Section = normalize(linkedEmployee.Section);
  payload.SubSection = normalize(linkedEmployee.SubSection);
  const existingUser = await db.prepare("SELECT ID FROM Login WHERE Username = ? COLLATE NOCASE LIMIT 1").get(payload.Username);
  if (existingUser) {
    return res.status(409).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0633\u0628\u0642\u064B\u0627." });
  }
  const timestamp = getCurrentTimestamp();
  try {
    const result = await db.prepare(`
      INSERT INTO Login (Username, Password, Permission, Department, Section, SubSection, AllowedPages, AllowedDepartments, AllowedSections, AllowedSubSections, Name, IsActive, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(payload.Username, payload.Password, payload.Permission, payload.Department, payload.Section, payload.SubSection, payload.AllowedPages, payload.AllowedDepartments, payload.AllowedSections, payload.AllowedSubSections, payload.Name, payload.IsActive, timestamp, timestamp);
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Add",
      page: "Settings",
      details: `Added login user ID=${result.lastInsertRowid}`
    });
    return res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645." });
  }
});
router.put("/users/:id", async (req, res) => {
  var _a, _b, _c, _d;
  if (denyIfNotAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D." });
  }
  const targetUser = await db.prepare(`
    SELECT ID, Username, Password, Permission, Name, Department, Section, IFNULL(SubSection, '') AS SubSection, IFNULL(AllowedPages, '[]') AS AllowedPages, IFNULL(AllowedDepartments, '[]') AS AllowedDepartments, IFNULL(AllowedSections, '[]') AS AllowedSections, IFNULL(AllowedSubSections, '[]') AS AllowedSubSections, IsActive
    FROM Login
    WHERE ID = ?
    LIMIT 1
  `).get(id);
  if (!targetUser) {
    return res.status(404).json({ message: "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0644\u0644\u062A\u0639\u062F\u064A\u0644." });
  }
  const isPrimaryAdmin = String(targetUser.Username || "").trim().toLowerCase() === "admin";
  if (isPrimaryAdmin) {
    const passwordOnly = normalize(req.body.Password);
    if (!passwordOnly) {
      return res.status(400).json({ message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062A\u0639\u062F\u064A\u0644 \u062D\u0633\u0627\u0628 admin \u0625\u0644\u0627 \u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631." });
    }
    const timestamp2 = getCurrentTimestamp();
    try {
      const result = await db.prepare(`
        UPDATE Login
        SET Password = ?, UpdatedAt = ?
        WHERE ID = ?
      `).run(passwordOnly, timestamp2, id);
      await logSystem({
        userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
        role: ((_b = req.user) == null ? void 0 : _b.role) || "",
        action: "Update",
        page: "Settings",
        details: `Updated admin password ID=${id}`
      });
      return res.json({ changes: result.changes });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062A\u0639\u062F\u064A\u0644 \u0643\u0644\u0645\u0629 \u0633\u0631 admin." });
    }
  }
  const rawPermission = normalize(req.body.Permission);
  const payload = {
    Username: normalize(req.body.Username),
    Password: normalize(req.body.Password),
    Permission: normalizePermission(rawPermission),
    Name: normalize(req.body.Name),
    Department: normalize(req.body.Department),
    SubSection: normalize(req.body.SubSection),
    Section: normalize(req.body.Section),
    AllowedPages: normalizeAllowedPagesInput(req.body.AllowedPages, req.body.EditablePages),
    AllowedDepartments: normalizeJsonArrayInput(req.body.AllowedDepartments),
    AllowedSections: normalizeJsonArrayInput(req.body.AllowedSections),
    AllowedSubSections: "[]",
    IsActive: Number(req.body.IsActive) === 0 ? 0 : 1
  };
  if (!payload.Username) {
    return res.status(400).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0637\u0644\u0648\u0628." });
  }
  if (!payload.Password) {
    return res.status(400).json({ message: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0633\u0631 \u0645\u0637\u0644\u0648\u0628\u0629." });
  }
  if (!rawPermission) {
    return res.status(400).json({ message: "\u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629 \u0645\u0637\u0644\u0648\u0628\u0629." });
  }
  const linkedEmployee = await getActiveEmployeeByName(payload.Name);
  if (!linkedEmployee) {
    return res.status(400).json({ message: "\u064A\u0631\u062C\u0649 \u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0633\u0645 \u0645\u0648\u0638\u0641 \u0646\u0634\u0637 \u0645\u0646 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646." });
  }
  payload.Name = normalize(linkedEmployee.Name);
  payload.Department = normalize(linkedEmployee.Department);
  payload.Section = normalize(linkedEmployee.Section);
  payload.SubSection = normalize(linkedEmployee.SubSection);
  const existingUser = await db.prepare("SELECT ID FROM Login WHERE Username = ? COLLATE NOCASE AND ID <> ? LIMIT 1").get(payload.Username, id);
  if (existingUser) {
    return res.status(409).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0633\u0628\u0642\u064B\u0627 \u0645\u0646 \u062D\u0633\u0627\u0628 \u0622\u062E\u0631." });
  }
  const timestamp = getCurrentTimestamp();
  try {
    const result = await db.prepare(`
      UPDATE Login
      SET Username = ?, Password = ?, Permission = ?, Department = ?, Section = ?, SubSection = ?, AllowedPages = ?, AllowedDepartments = ?, AllowedSections = ?, AllowedSubSections = ?, Name = ?, IsActive = ?, UpdatedAt = ?
      WHERE ID = ?
    `).run(payload.Username, payload.Password, payload.Permission, payload.Department, payload.Section, payload.SubSection, payload.AllowedPages, payload.AllowedDepartments, payload.AllowedSections, payload.AllowedSubSections, payload.Name, payload.IsActive, timestamp, id);
    if (result.changes === 0) {
      return res.status(404).json({ message: "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0644\u0644\u062A\u0639\u062F\u064A\u0644." });
    }
    await logSystem({
      userName: ((_c = req.user) == null ? void 0 : _c.username) || "system",
      role: ((_d = req.user) == null ? void 0 : _d.role) || "",
      action: "Update",
      page: "Settings",
      details: `Updated login user ID=${id}`
    });
    return res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062A\u0639\u062F\u064A\u0644 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645." });
  }
});
router.delete("/users/:id", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D." });
  }
  const target = await db.prepare("SELECT ID, Username FROM Login WHERE ID = ? LIMIT 1").get(id);
  if (!target) {
    return res.status(404).json({ message: "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0644\u0644\u062D\u0630\u0641." });
  }
  if (String(target.Username || "").trim().toLowerCase() === "admin") {
    return res.status(400).json({ message: "\u0644\u0627 \u064A\u0645\u0643\u0646 \u062D\u0630\u0641 \u062D\u0633\u0627\u0628 admin \u0627\u0644\u0631\u0626\u064A\u0633\u064A." });
  }
  try {
    const result = await db.prepare("DELETE FROM Login WHERE ID = ?").run(id);
    if (result.changes === 0) {
      return res.status(404).json({ message: "\u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0644\u0644\u062D\u0630\u0641." });
    }
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Delete",
      page: "Settings",
      details: `Deleted login user ID=${id}`
    });
    return res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645." });
  }
});
router.get("/administrative-templates", async (req, res) => {
  if (denyIfNotAdmin(req, res)) return;
  try {
    const rows = await db.prepare(`
      SELECT ID, TemplateName, TemplateFileName, Coordinates, CreatedAt, UpdatedAt
      FROM AdministrativeTemplateConfigs
      ORDER BY TemplateName ASC
    `).all();
    const payload = rows.map((row) => {
      const templateFileName = normalize(row.TemplateFileName);
      const templateBaseName = path.basename(templateFileName);
      const templateFilePath = templateBaseName ? path.join(templatesRoot, templateBaseName) : "";
      return {
        ...row,
        TemplateFilePath: templateFilePath
      };
    });
    return res.json(payload);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0646\u0645\u0627\u0630\u062C \u0627\u0644\u0625\u062F\u0627\u0631\u064A\u0629." });
  }
});
router.post("/administrative-templates", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const templateFileName = normalize(req.body.TemplateFileName);
  const templateName = normalize(req.body.TemplateName) || deriveTemplateNameFromFileName(templateFileName);
  const coordinates = normalize(req.body.Coordinates);
  if (!templateName) {
    return res.status(400).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0645\u0637\u0644\u0648\u0628 \u0623\u0648 \u0627\u0631\u0641\u0639 \u0645\u0644\u0641\u064B\u0627 \u0628\u0627\u0633\u0645 \u0635\u0627\u0644\u062D." });
  }
  if (!templateFileName) {
    return res.status(400).json({ message: "\u0631\u0627\u0628\u0637/\u0645\u0644\u0641 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0645\u0637\u0644\u0648\u0628." });
  }
  const exists = await db.prepare("SELECT ID FROM AdministrativeTemplateConfigs WHERE TemplateName = ? COLLATE NOCASE LIMIT 1").get(templateName);
  if (exists) {
    return res.status(409).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0645\u0648\u062C\u0648\u062F \u0645\u0633\u0628\u0642\u0627\u064B." });
  }
  try {
    const timestamp = getCurrentTimestamp();
    const result = await db.prepare(`
      INSERT INTO AdministrativeTemplateConfigs (TemplateName, TemplateFileName, Coordinates, CreatedAt, UpdatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(templateName, templateFileName, coordinates, timestamp, timestamp);
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Add",
      page: "Settings",
      details: `Added administrative template config ID=${result.lastInsertRowid}`
    });
    return res.json({ id: result.lastInsertRowid });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u0625\u0636\u0627\u0641\u0629 \u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0646\u0645\u0648\u0630\u062C." });
  }
});
router.put("/administrative-templates/:id", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u063A\u064A\u0631 \u0635\u0627\u0644\u062D." });
  }
  const templateFileName = normalize(req.body.TemplateFileName);
  const templateName = normalize(req.body.TemplateName) || deriveTemplateNameFromFileName(templateFileName);
  const coordinates = normalize(req.body.Coordinates);
  if (!templateName) {
    return res.status(400).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0645\u0637\u0644\u0648\u0628 \u0623\u0648 \u0627\u0631\u0641\u0639 \u0645\u0644\u0641\u064B\u0627 \u0628\u0627\u0633\u0645 \u0635\u0627\u0644\u062D." });
  }
  if (!templateFileName) {
    return res.status(400).json({ message: "\u0631\u0627\u0628\u0637/\u0645\u0644\u0641 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0645\u0637\u0644\u0648\u0628." });
  }
  const exists = await db.prepare("SELECT ID FROM AdministrativeTemplateConfigs WHERE TemplateName = ? COLLATE NOCASE AND ID <> ? LIMIT 1").get(templateName, id);
  if (exists) {
    return res.status(409).json({ message: "\u0627\u0633\u0645 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0646 \u0633\u062C\u0644 \u0622\u062E\u0631." });
  }
  try {
    const timestamp = getCurrentTimestamp();
    const result = await db.prepare(`
      UPDATE AdministrativeTemplateConfigs
      SET TemplateName = ?, TemplateFileName = ?, Coordinates = ?, UpdatedAt = ?
      WHERE ID = ?
    `).run(templateName, templateFileName, coordinates, timestamp, id);
    if (result.changes === 0) {
      return res.status(404).json({ message: "\u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0644\u0644\u062A\u0639\u062F\u064A\u0644." });
    }
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Update",
      page: "Settings",
      details: `Updated administrative template config ID=${id}`
    });
    return res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062A\u0639\u062F\u064A\u0644 \u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0646\u0645\u0648\u0630\u062C." });
  }
});
router.delete("/administrative-templates/:id", async (req, res) => {
  var _a, _b;
  if (denyIfNotAdmin(req, res)) return;
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ message: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0646\u0645\u0648\u0630\u062C \u063A\u064A\u0631 \u0635\u0627\u0644\u062D." });
  }
  try {
    const result = await db.prepare("DELETE FROM AdministrativeTemplateConfigs WHERE ID = ?").run(id);
    if (result.changes === 0) {
      return res.status(404).json({ message: "\u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0644\u0644\u062D\u0630\u0641." });
    }
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Delete",
      page: "Settings",
      details: `Deleted administrative template config ID=${id}`
    });
    return res.json({ changes: result.changes });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0646\u0645\u0648\u0630\u062C." });
  }
});
module.exports = router;
