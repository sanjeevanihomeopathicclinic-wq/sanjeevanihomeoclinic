const express = require('express');
const router = express.Router();
const mock = require('../lib/mockData');
const { requireRole } = require('../middleware/auth');

// Doctor only: view audit log
router.get('/', requireRole('doctor'), (req, res) => {
  const list = [...mock.AUDIT_LOG].reverse().slice(0, 500);
  res.json({ log: list });
});

// Stub for sheets route
router.get('/sheets-status', requireRole('doctor'), (req, res) => {
  res.json({ mode: process.env.USE_MOCK_DATA === 'true' ? 'mock' : 'google-sheets' });
});

module.exports = router;
