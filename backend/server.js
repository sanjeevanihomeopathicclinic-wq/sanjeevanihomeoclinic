/**
 * Sanjeevani Clinic – Backend API Server
 * Node.js + Express
 * Google Sheets (database) + Google Drive (file storage)
 * All credentials via environment variables ONLY – never in source code.
 */

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const sheetsRouter = require('./routes/sheets');
const driveRouter = require('./routes/drive');
const authRouter = require('./routes/auth');
const patientsRouter = require('./routes/patients');
const appointmentsRouter = require('./routes/appointments');
const consultationsRouter = require('./routes/consultations');
const paymentsRouter = require('./routes/payments');
const auditRouter = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
    },
  },
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
});
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  message: { error: 'Too many requests. Please slow down.' },
});

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Session ───────────────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
  name: 'sanjeevanisid',
}));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRouter);
app.use('/api', apiLimiter);
app.use('/api/patients', patientsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/consultations', consultationsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/drive', driveRouter);
app.use('/api/audit', auditRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── 404 + Error handler ───────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`Sanjeevani API running on port ${PORT}`));
module.exports = app;
