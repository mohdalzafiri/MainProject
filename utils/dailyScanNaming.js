function pad2(value) {
  return String(value).padStart(2, '0');
}

function getSafeFilePart(value, fallback) {
  const text = String(value || '').trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (text || fallback).slice(0, 100);
}

function getDailyScanFileName(record, createdAt = new Date(), sequence = 1) {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new Error('تاريخ تسمية ملف المسح غير صالح.');
  }

  const section = getSafeFilePart(record && record.Section, 'نوبة');
  const datePart = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  const timePart = `${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
  const sequencePart = String(sequence).padStart(3, '0');
  return `${section}_${datePart}_${timePart}_${sequencePart}.pdf`;
}

module.exports = { getDailyScanFileName, getSafeFilePart };
