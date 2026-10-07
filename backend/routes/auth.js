const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const mock = require('../lib/mockData');
const { logAudit } = require('../lib/audit');

// ── POST /api/auth/login ───────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    let user;
    if (process.env.USE_MOCK_DATA === 'true') {
      user = mock.USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
    } else {
      // Production: look up Users sheet via Google Sheets
      const { getSheetsClient } = require('../lib/googleClient');
      const sheets = await getSheetsClient();
      const res2 = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Users!A:H',
      });
      const rows = res2.data.values || [];
      const found = rows.find(r => r[2]?.toLowerCase() === email.toLowerCase());
      if (found) {
        user = {
          id: found[0], name: found[1], email: found[2],
          passwordHash: found[3], role: found[4],
          patientId: found[5] || null, phone: found[6] || '',
        };
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await logAudit({ userId: user.id, userRole: user.role, action: 'LOGIN_FAIL', resource: 'auth', ip: req.ip });
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Store minimal session data
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      patientId: user.patientId || null,
    };

    await logAudit({ userId: user.id, userRole: user.role, action: 'LOGIN', resource: 'auth', ip: req.ip });

    return res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, patientId: user.patientId },
    });
  } catch (err) {
    console.error('[AUTH LOGIN]', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  const user = req.session && req.session.user;
  req.session.destroy(() => {
    res.clearCookie('sanjeevanisid');
    if (user) logAudit({ userId: user.id, userRole: user.role, action: 'LOGOUT', resource: 'auth', ip: req.ip }).catch(() => {});
    res.json({ success: true });
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  res.json({ user: req.session.user });
});

// ── POST /api/auth/register (patient self-registration) ──────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, dob, gender } = req.body;
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'Name, email, password and phone are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Check duplicate email
    if (process.env.USE_MOCK_DATA === 'true') {
      const exists = mock.USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (exists) return res.status(409).json({ error: 'An account with this email already exists.' });

      const patientId = mock.nextPatientId();
      const userId = `u-${Date.now()}`;
      const passwordHash = await bcrypt.hash(password, 10);

      const newUser = { id: userId, email, passwordHash, role: 'patient', name, phone, patientId };
      mock.USERS.push(newUser);

      const newPatient = {
        patientId, name, dob: dob || '', gender: gender || '', phone, email,
        address: '', bloodGroup: '', allergies: '', registeredOn: new Date().toISOString().split('T')[0], userId,
      };
      mock.PATIENTS.push(newPatient);

      req.session.user = { id: userId, name, email, role: 'patient', patientId };
      await logAudit({ userId, userRole: 'patient', action: 'REGISTER', resource: 'auth', ip: req.ip });

      return res.status(201).json({ success: true, user: req.session.user, patientId });
    }

    // Production: write to Users + Patients sheet
    return res.status(501).json({ error: 'Connect Google account to enable live registration.' });
  } catch (err) {
    console.error('[AUTH REGISTER]', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

module.exports = router;
