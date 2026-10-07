/**
 * Simple static frontend dev server
 * Serves the sanjeevani-clinic folder and proxies /api/* to the backend.
 * Run: node devserver.js
 */
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.FRONTEND_PORT || 3000;
const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';

// Proxy all /api calls to the backend
app.use('/api', createProxyMiddleware({ target: BACKEND, changeOrigin: true, logLevel: 'warn' }));

// Serve static files
app.use(express.static(path.join(__dirname)));

app.listen(PORT, () => {
  console.log(`Frontend dev server: http://localhost:${PORT}`);
  console.log(`Proxying /api → ${BACKEND}`);
  console.log('');
  console.log('Available portals:');
  console.log(`  Doctor:       http://localhost:${PORT}/doctor/login.html`);
  console.log(`  Reception:    http://localhost:${PORT}/reception/login.html`);
  console.log(`  Patient:      http://localhost:${PORT}/patient/login.html`);
  console.log(`  Public site:  http://localhost:${PORT}/index.html`);
});
