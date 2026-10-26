const fs = require('fs');
const path = require('path');
const { getSafeFilePart } = require('../utils/dailyScanNaming');

const defaultDepartmentMailScanRoot = String(process.env.COMPUTERNAME || '').trim().toUpperCase() === 'PC-SERVER'
  ? 'G:\\Database\\Mail'
  : '\\\\PC-SERVER\\Database\\Mail';
const departmentMailScanRoot = process.env.DEPARTMENT_MAIL_SCAN_ROOT || defaultDepartmentMailScanRoot;

function getDepartmentMailScanDirectory(record) {
  return path.join(
    departmentMailScanRoot,
    getSafeFilePart(record && record.Department, 'قسم'),
    getSafeFilePart(record && record.Section, 'نوبة')
  );
}

function ensureDepartmentMailScanDirectory(record) {
  const directory = getDepartmentMailScanDirectory(record);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function getDepartmentMailScanKey(record) {
  return String(record && record.ID || '').trim();
}

module.exports = {
  departmentMailScanRoot,
  getDepartmentMailScanDirectory,
  ensureDepartmentMailScanDirectory,
  getDepartmentMailScanKey
};
