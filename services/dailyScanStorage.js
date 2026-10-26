const fs = require('fs');
const path = require('path');
const { getSafeFilePart } = require('../utils/dailyScanNaming');

const defaultDailyScanRoot = String(process.env.COMPUTERNAME || '').trim().toUpperCase() === 'PC-SERVER'
  ? 'G:\\Database\\Daily'
  : '\\\\PC-SERVER\\Database\\Daily';
const dailyScanRoot = process.env.DAILY_SCAN_ROOT || defaultDailyScanRoot;

function getDailyScanSectionDirectory(section) {
  return path.join(dailyScanRoot, getSafeFilePart(section, 'نوبة'));
}

function ensureDailyScanSectionDirectory(section) {
  const directory = getDailyScanSectionDirectory(section);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function getDailyScanKey(record) {
  return [
    String(record && record.Today || '').trim().replace(/\//g, '-'),
    String(record && record.Department || '').trim(),
    String(record && record.Section || '').trim(),
    String(record && record.Period || '').trim()
  ].join('|');
}

module.exports = {
  dailyScanRoot,
  getDailyScanSectionDirectory,
  ensureDailyScanSectionDirectory,
  getDailyScanKey
};
