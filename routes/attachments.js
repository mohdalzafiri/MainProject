const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { db, logSystem } = require("../database");
const { isWithinDataScope } = require("../auth/dataScope");
const { removeSync } = require("../utils/fsCompat");
const { receivePdfScan, isPdfScanFile } = require("../services/pdfScanUpload");
const { getEmailScanPath, ensureEmailScanDirectory } = require("../services/emailScanStorage");
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});
const moduleConfig = {
  holidays: { table: "Holiday", pageKey: "holidays", pageName: "Holiday" },
  reduction: { table: "Reduction", pageKey: "reduction", pageName: "Reduction" },
  courses: { table: "Course", pageKey: "courses", pageName: "Course" },
  transfers: { table: "Transfer", pageKey: "transfers", pageName: "Transfer" },
  outgoing: { table: "OutgoingDocuments", pageKey: "outgoing", pageName: "Outgoing" },
  incoming: { table: "IncomingDocuments", pageKey: "incoming", pageName: "Incoming" }
};
function parseRecordId(rawValue) {
  const value = Number(rawValue || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
function normalizeModule(rawValue) {
  return String(rawValue || "").trim().toLowerCase();
}
function resolveModuleConfig(moduleKey) {
  return moduleConfig[moduleKey] || null;
}
function getRecordDirectory(moduleKey, recordId) {
  return path.join(__dirname, "..", "public", "generated", moduleKey, String(recordId));
}
function ensureAllowed(req, moduleKey, method) {
  var _a, _b, _c;
  const config = resolveModuleConfig(moduleKey);
  if (!config) {
    return { ok: false, status: 404, message: "\u0646\u0648\u0639 \u0627\u0644\u0648\u0627\u062C\u0647\u0629 \u063A\u064A\u0631 \u0645\u062F\u0639\u0648\u0645 \u0644\u0644\u0645\u0631\u0641\u0642\u0627\u062A." };
  }
  const role = String(((_a = req.user) == null ? void 0 : _a.role) || "").trim().toLowerCase();
  const isAdmin = role === "admin";
  const isViewOnly = role === "view";
  const allowedPages = Array.isArray((_b = req.user) == null ? void 0 : _b.allowedPages) ? req.user.allowedPages : [];
  const editablePages = Array.isArray((_c = req.user) == null ? void 0 : _c.editablePages) ? req.user.editablePages : allowedPages;
  if (!isAdmin && !allowedPages.includes(config.pageKey)) {
    return { ok: false, status: 403, message: "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D \u0644\u0643 \u0628\u0627\u0644\u0648\u0635\u0648\u0644 \u0644\u0645\u0631\u0641\u0642\u0627\u062A \u0647\u0630\u0647 \u0627\u0644\u0648\u0627\u062C\u0647\u0629." };
  }
  if (!isAdmin && method !== "GET" && method !== "HEAD" && (isViewOnly || !editablePages.includes(config.pageKey))) {
    return { ok: false, status: 403, message: "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0623\u0648 \u0627\u0644\u062A\u0639\u062F\u064A\u0644 \u0623\u0648 \u0627\u0644\u062D\u0630\u0641" };
  }
  return { ok: true, config };
}
async function ensureRecordExists(config, recordId, access) {
  const row = await db.prepare(`SELECT * FROM ${config.table} WHERE ID = ? LIMIT 1`).get(recordId);
  return Boolean(row) && (!config.scoped || isWithinDataScope(row, access));
}
function readImageFiles(moduleKey, recordId) {
  const directory = getRecordDirectory(moduleKey, recordId);
  if (!fs.existsSync(directory)) {
    return [];
  }
  const files = fs.readdirSync(directory).filter((name) => /^\d{3}\.jpg$/i.test(name)).sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
  return files.map((fileName) => ({
    fileName,
    url: `/generated/${moduleKey}/${recordId}/${fileName}`
  }));
}
function getNextFileName(moduleKey, recordId) {
  const images = readImageFiles(moduleKey, recordId);
  const maxIndex = images.reduce((maxValue, item) => {
    const match = String(item.fileName || "").match(/^(\d{3})\.jpg$/i);
    if (!match) return maxValue;
    const current = Number(match[1]);
    return current > maxValue ? current : maxValue;
  }, 0);
  const nextIndex = maxIndex + 1;
  return `${String(nextIndex).padStart(3, "0")}.jpg`;
}

async function authorizeEmailScan(req, res, method) {
  const moduleKey = normalizeModule(req.params.module);
  const recordId = parseRecordId(req.params.recordId);
  const access = ensureAllowed(req, moduleKey, method);
  if (!access.ok) {
    res.status(access.status).json({ message: access.message });
    return null;
  }
  if (!recordId) {
    res.status(400).json({ message: "معرّف السجل غير صالح." });
    return null;
  }
  if (!await ensureRecordExists(access.config, recordId, req.access)) {
    res.status(404).json({ message: "السجل المطلوب غير موجود أو غير متاح ضمن نطاق صلاحيتك." });
    return null;
  }
  return { moduleKey, recordId, config: access.config };
}

router.get("/email-scans/:module/:recordId/pdf", async (req, res) => {
  const target = await authorizeEmailScan(req, res, "GET");
  if (!target) return;
  const filePath = getEmailScanPath(target.moduleKey, target.recordId);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: "لا يوجد بريد إلكتروني ممسوح لهذا السجل." });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="email.pdf"');
  const stream = fs.createReadStream(filePath);
  stream.on("error", (error) => {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ message: "تعذر قراءة ملف البريد الإلكتروني." });
    else res.destroy(error);
  });
  return stream.pipe(res);
});

router.get("/email-scans/:module/:recordId", async (req, res) => {
  const target = await authorizeEmailScan(req, res, "GET");
  if (!target) return;
  const filePath = getEmailScanPath(target.moduleKey, target.recordId);
  return res.json({
    exists: fs.existsSync(filePath),
    fileName: fs.existsSync(filePath) ? "email.pdf" : ""
  });
});

router.post("/email-scans/:module/:recordId", receivePdfScan, async (req, res) => {
  const target = await authorizeEmailScan(req, res, "POST");
  if (!target) return;
  if (!isPdfScanFile(req.file)) {
    return res.status(400).json({ message: "الملف المرفوع ليس ملف PDF صالحًا." });
  }

  const filePath = getEmailScanPath(target.moduleKey, target.recordId);
  try {
    ensureEmailScanDirectory(target.moduleKey, target.recordId);
    fs.writeFileSync(filePath, req.file.buffer);
    await logSystem({
      userName: (req.user && req.user.username) || "system",
      role: (req.user && req.user.role) || "",
      action: "Upload",
      page: target.config.pageName,
      details: `Uploaded email scan PDF ${target.moduleKey}/${target.recordId}/email.pdf`
    });
    return res.json({ fileName: "email.pdf" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "تعذر حفظ ملف البريد الإلكتروني." });
  }
});

router.delete("/email-scans/:module/:recordId", async (req, res) => {
  const target = await authorizeEmailScan(req, res, "DELETE");
  if (!target) return;
  const filePath = getEmailScanPath(target.moduleKey, target.recordId);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await logSystem({
      userName: (req.user && req.user.username) || "system",
      role: (req.user && req.user.role) || "",
      action: "Delete",
      page: target.config.pageName,
      details: `Deleted email scan PDF ${target.moduleKey}/${target.recordId}/email.pdf`
    });
    return res.json({ message: "تم حذف البريد الإلكتروني المحفوظ." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "تعذر حذف ملف البريد الإلكتروني." });
  }
});

router.get("/:module/:recordId", async (req, res) => {
  const moduleKey = normalizeModule(req.params.module);
  const recordId = parseRecordId(req.params.recordId);
  const access = ensureAllowed(req, moduleKey, "GET");
  if (!access.ok) {
    return res.status(access.status).json({ message: access.message });
  }
  if (!recordId) {
    return res.status(400).json({ message: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D." });
  }
  if (!await ensureRecordExists(access.config, recordId, req.access)) {
    return res.status(404).json({ message: "\u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
  }
  const images = readImageFiles(moduleKey, recordId);
  return res.json({ images, total: images.length });
});
router.post("/:module/:recordId", upload.single("image"), async (req, res) => {
  var _a, _b;
  const moduleKey = normalizeModule(req.params.module);
  const recordId = parseRecordId(req.params.recordId);
  const access = ensureAllowed(req, moduleKey, "POST");
  if (!access.ok) {
    return res.status(access.status).json({ message: access.message });
  }
  if (!recordId) {
    return res.status(400).json({ message: "\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0633\u062C\u0644 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D." });
  }
  if (!await ensureRecordExists(access.config, recordId, req.access)) {
    return res.status(404).json({ message: "\u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
  }
  if (!req.file) {
    return res.status(400).json({ message: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0633\u062A\u0644\u0627\u0645 \u0635\u0648\u0631\u0629 \u0644\u0644\u0631\u0641\u0639." });
  }
  const mimeType = String(req.file.mimetype || "").toLowerCase();
  if (!mimeType.startsWith("image/")) {
    return res.status(400).json({ message: "\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0631\u0641\u0648\u0639 \u0644\u064A\u0633 \u0635\u0648\u0631\u0629." });
  }
  try {
    const targetDir = getRecordDirectory(moduleKey, recordId);
    fs.mkdirSync(targetDir, { recursive: true });
    const fileName = getNextFileName(moduleKey, recordId);
    const targetFile = path.join(targetDir, fileName);
    fs.writeFileSync(targetFile, req.file.buffer);
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Upload",
      page: access.config.pageName,
      details: `Uploaded attachment ${moduleKey}/${recordId}/${fileName}`
    });
    return res.json({
      fileName,
      url: `/generated/${moduleKey}/${recordId}/${fileName}`
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0633\u062A\u0646\u062F." });
  }
});
router.delete("/:module/:recordId/:fileName", async (req, res) => {
  var _a, _b;
  const moduleKey = normalizeModule(req.params.module);
  const recordId = parseRecordId(req.params.recordId);
  const fileName = String(req.params.fileName || "").trim();
  const access = ensureAllowed(req, moduleKey, "DELETE");
  if (!access.ok) {
    return res.status(access.status).json({ message: access.message });
  }
  if (!recordId || !/^\d{3}\.jpg$/i.test(fileName)) {
    return res.status(400).json({ message: "\u0628\u064A\u0627\u0646\u0627\u062A \u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0633\u062A\u0646\u062F \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629." });
  }
  if (!await ensureRecordExists(access.config, recordId, req.access)) {
    return res.status(404).json({ message: "\u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F." });
  }
  const recordDirectory = getRecordDirectory(moduleKey, recordId);
  const targetFile = path.join(recordDirectory, fileName);
  if (!fs.existsSync(targetFile)) {
    return res.status(404).json({ message: "\u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0633\u062A\u0646\u062F \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u062D\u0630\u0641\u0647\u0627 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F\u0629." });
  }
  try {
    fs.unlinkSync(targetFile);
    if (fs.existsSync(recordDirectory) && fs.readdirSync(recordDirectory).length === 0) {
      removeSync(recordDirectory, { recursive: true, force: true });
    }
    await logSystem({
      userName: ((_a = req.user) == null ? void 0 : _a.username) || "system",
      role: ((_b = req.user) == null ? void 0 : _b.role) || "",
      action: "Delete",
      page: access.config.pageName,
      details: `Deleted attachment ${moduleKey}/${recordId}/${fileName}`
    });
    return res.json({ message: "\u062A\u0645 \u062D\u0630\u0641 \u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0633\u062A\u0646\u062F \u0628\u0646\u062C\u0627\u062D." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "\u062A\u0639\u0630\u0631 \u062D\u0630\u0641 \u0635\u0648\u0631\u0629 \u0627\u0644\u0645\u0633\u062A\u0646\u062F \u0645\u0646 \u0627\u0644\u062A\u062E\u0632\u064A\u0646." });
  }
});
module.exports = router;
