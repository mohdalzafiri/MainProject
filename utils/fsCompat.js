const fs = require('fs');

function removeSync(targetPath, { recursive = false, force = false } = {}) {
  try {
    const stats = fs.lstatSync(targetPath);
    if (stats.isDirectory()) {
      fs.rmdirSync(targetPath, { recursive });
    } else {
      fs.unlinkSync(targetPath);
    }
  } catch (error) {
    if (force && error.code === 'ENOENT') return;
    throw error;
  }
}

module.exports = { removeSync };