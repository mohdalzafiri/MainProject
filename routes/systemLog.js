const express = require('express');
const { db } = require('../database');

const router = express.Router();

router.get('/', (req, res) => {
  const filters = [];
  const params = [];

  if (req.query.userName) {
    filters.push('UserName = ?');
    params.push(req.query.userName);
  }
  if (req.query.action) {
    filters.push('Action = ?');
    params.push(req.query.action);
  }
  if (req.query.target) {
    filters.push('Target = ?');
    params.push(req.query.target);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const sql = `SELECT * FROM SystemLog ${whereClause} ORDER BY Timestamp DESC LIMIT 1000`;
  const records = db.prepare(sql).all(...params);
  res.json(records);
});

module.exports = router;
