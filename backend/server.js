/**
 * Sanjeevani Clinic – Unified Server
 * Serves the public website + CMS frontend as static files AND the API.
 * Deploy to Render / Railway / Fly.io — no local setup required.
 * All credentials via environment variables ONLY.
 */

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

// Trust Render's proxy so express-rate-limit reads the real client IP
// from X-Forwarded-For correctly

const authRouter        = require('./routes/auth');
const patientsRouter    = require('./routes/patients');
const appointmentsRouter = require('./routes/appointments');
const consultationsRouter = require('./routes/consultations');
const paymentsRouter    = require('./routes/payments');
const driveRouter       = require('./routes/drive');
const auditRouter       = require('./routes/audit');

const app = express();
app.set('trust proxy', 1); // trust first proxy (Render load balancer)
const PORT = process.env.PORT || 3001;

// ── Static files — serve the entire clinic folder from the repo root ──────────
// __dirname is sanjeevani-clinic/backend, so go one level up to sanjeevani-clinic
const STATIC_ROOT = path.join(__dirname, '..');

// ── Security headers ──────────────────────────────────────────────────────────
// Applied BEFORE static middleware so API responses get helmet headers.
// Static HTML pages need 'unsafe-inline' for scripts (inline <script> blocks).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc:     ["'self'", "https://fonts.gstatic.com"],
      imgSrc:      ["'self'", "data:", "blob:"],
      connectSrc:  ["'self'", "https://script.google.com", "https://script.googleusercontent.com"],
      frameSrc:    ["https://www.google.com"],
    },
  },
  crossOriginOpenerPolicy: false,
}));

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(STATIC_ROOT));

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
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
  },
  name: 'sanjeevanisid',
}));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRouter);
app.use('/api', apiLimiter);
app.use('/api/patients',      patientsRouter);
app.use('/api/appointments',  appointmentsRouter);
app.use('/api/consultations', consultationsRouter);
app.use('/api/payments',      paymentsRouter);
app.use('/api/drive',         driveRouter);
app.use('/api/audit',         auditRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ── SPA fallback: unknown paths → public website home ─────────────────────────
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(STATIC_ROOT, 'index.html'));
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Sanjeevani Clinic running on port ${PORT}`);
  console.log(`  Public site:  /`);
  console.log(`  Doctor:       /doctor/login.html`);
  console.log(`  Reception:    /reception/login.html`);
  console.log(`  Patient:      /patient/login.html`);
});
module.exports = app;
