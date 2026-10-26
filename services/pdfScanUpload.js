const multer = require('multer');

const MAX_PDF_SCAN_BYTES = 60 * 1024 * 1024;
const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SCAN_BYTES, files: 1 }
}).single('pdf');

function receivePdfScan(req, res, next) {
  uploadPdf(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: 'حجم ملف PDF كبير جدًا. الحد الأقصى المسموح 60MB.' });
      return;
    }

    console.error(error);
    res.status(400).json({ message: 'تعذر استقبال ملف PDF. أعد إنشاء الملف ثم حاول مرة أخرى.' });
  });
}

function isPdfScanFile(file) {
  return Boolean(
    file
    && file.buffer
    && file.buffer.length >= 5
    && file.buffer.slice(0, 5).equals(Buffer.from('%PDF-'))
  );
}

module.exports = {
  MAX_PDF_SCAN_BYTES,
  receivePdfScan,
  isPdfScanFile
};
