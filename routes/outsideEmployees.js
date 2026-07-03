const express = require('express');
const { db } = require('../database');

const router = express.Router();

function isActiveStatus(status) {
  return String(status || '').trim() === 'نشط';
}

router.get('/', (req, res) => {
  try {
    const records = db.prepare('SELECT * FROM Main ORDER BY ID DESC').all();
    const outsideRecords = records.filter((item) => !isActiveStatus(item.Status));
    res.json(outsideRecords);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'تعذر قراءة بيانات خارج الإدارة من قاعدة البيانات' });
  }
});

module.exports = router;