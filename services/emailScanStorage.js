const fs = require('fs');
const path = require('path');

const defaultEmailScanRoot = String(process.env.COMPUTERNAME || '').trim().toUpperCase() === 'PC-SERVER'
  ? 'G:\\Database'
  : '\\\\PC-SERVER\\Database';
const emailScanRoot = process.env.EMAIL_SCAN_ROOT || defaultEmailScanRoot;

const interfaceFolders = Object.freeze({
  holidays: 'Holidays',
  reduction: 'Reduction',
  courses: 'Courses',
  transfers: 'Transfers',
  outgoing: 'Outgoing',
  incoming: 'Incoming'
});

function getEmailScanDirectory(moduleKey, recordId) {
  const interfaceFolder = interfaceFolders[String(moduleKey || '').trim().toLowerCase()];
  if (!interfaceFolder) {
    throw new Error(`Unsupported email scan interface: ${moduleKey}`);
  }
  return path.join(emailScanRoot, interfaceFolder, String(recordId));
}

function getEmailScanPath(moduleKey, recordId) {
  return path.join(getEmailScanDirectory(moduleKey, recordId), 'email.pdf');
}

function ensureEmailScanDirectory(moduleKey, recordId) {
  const directory = getEmailScanDirectory(moduleKey, recordId);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

module.exports = {
  emailScanRoot,
  interfaceFolders,
  getEmailScanDirectory,
  getEmailScanPath,
  ensureEmailScanDirectory
};
