const { getSafeFilePart } = require('./dailyScanNaming');

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getDepartmentMailScanFileName(record, createdAt = new Date(), sequence = 1) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error('تاريخ تسمية ملف المسح غير صالح.');
  }

  const target = getSafeFilePart(
    record && (record.Section || record.Department),
    'بريد_قسم'
  );
  const datePart = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const timePart = `${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
  const sequencePart = String(sequence).padStart(3, '0');
  return `${target}_${datePart}_${timePart}_${sequencePart}.pdf`;
}

module.exports = { getDepartmentMailScanFileName };
