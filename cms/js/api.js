/**
 * Sanjeevani CMS – Shared frontend API utilities
 * Backend: Google Apps Script Web App (token-based auth)
 * Token stored in sessionStorage — never in URL or localStorage.
 */

// ── Set this to your Apps Script Web App URL after deploying ──────────────────
var GAS_URL = window.SANJEEVANI_GAS_URL || '';

// ── Base path helper (works on GitHub Pages /repo-name/ AND on custom domains /)
// Finds the common prefix up to and including the first path segment that
// contains "doctor", "reception", "patient", or "cms" — then strips it.
// Falls back to '/' for a custom domain at root.
function _basePath() {
  var p = window.location.pathname;           // e.g. /sanjeevanihomeoclinic/doctor/login.html
  var m = p.match(/^(\/[^/]+\/)/);            // grab first two segments: /repo/
  if (!m) return '/';
  // Only use as prefix when it's clearly a sub-directory (GitHub Pages)
  var seg = m[1];                             // e.g. "/sanjeevanihomeoclinic/"
  // If the repo root index.html exists at this path it IS the base
  return seg;
}

// ── Token storage (sessionStorage — cleared when browser tab closes) ──────────
function getToken()        { return sessionStorage.getItem('sj_token') || ''; }
function setToken(t)       { sessionStorage.setItem('sj_token', t); }
function clearToken()      { sessionStorage.removeItem('sj_token'); sessionStorage.removeItem('sj_user'); }
function getCachedUser()   { try { return JSON.parse(sessionStorage.getItem('sj_user') || 'null'); } catch { return null; } }
function setCachedUser(u)  { sessionStorage.setItem('sj_user', JSON.stringify(u)); }

// ── Core fetch (GET) ──────────────────────────────────────────────────────────
async function gasGet(action, params) {
  params = params || {};
  params.action = action;
  var token = getToken();
  if (token) params.token = token;
  var qs = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var url = GAS_URL + '?' + qs;
  var res = await fetch(url, { redirect: 'follow' });
  var data = await res.json();
  if (data.error) throw Object.assign(new Error(data.error), { code: data.code });
  return data;
}

// ── Core fetch (POST via GET with encoded body) ───────────────────────────────
// Apps Script does not support CORS preflight (OPTIONS), so we encode the
// POST body as a base64 query param and use GET — Apps Script handles it.
async function gasPost(action, body) {
  body = body || {};
  var token = getToken();
  var payload = btoa(unescape(encodeURIComponent(JSON.stringify(body))));
  var params = { action: action, payload: payload };
  if (token) params.token = token;
  var qs = Object.keys(params).map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var url = GAS_URL + '?' + qs;
  var res = await fetch(url, { redirect: 'follow' });
  var data = await res.json();
  if (data.error) throw Object.assign(new Error(data.error), { code: data.code });
  return data;
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function getMe() {
  var cached = getCachedUser();
  if (cached) return cached;
  try {
    var data = await gasGet('me');
    setCachedUser(data.user);
    return data.user;
  } catch { return null; }
}

async function login(email, password) {
  var data = await gasPost('login', { email: email, password: password });
  setToken(data.token);
  setCachedUser(data.user);
  return data.user;
}

async function logout() {
  try { await gasPost('logout', {}); } catch {}
  clearToken();
  window.location.href = _basePath() + 'index.html';
}

async function requireAuth(expectedRole) {
  var user = await getMe();
  if (!user) { window.location.href = _basePath() + expectedRole + '/login.html'; return null; }
  if (expectedRole && user.role !== expectedRole) {
    window.location.href = _basePath() + user.role + '/login.html';
    return null;
  }
  return user;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function el(id)           { return document.getElementById(id); }
function show(id)         { var e=el(id); if(e) e.style.display=''; }
function hide(id)         { var e=el(id); if(e) e.style.display='none'; }
function setText(id, txt) { var e=el(id); if(e) e.textContent=txt; }
function showToast(msg, type) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.className = 'toast toast-' + (type || 'success');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(function(){ t.style.display='none'; }, 3500);
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }); }
  catch { return d; }
}
function fmtTime(t) {
  if (!t) return '—';
  var parts = t.split(':');
  var h = parseInt(parts[0]); var m = parts[1];
  return (h%12||12) + ':' + m + ' ' + (h>=12?'PM':'AM');
}
function statusBadge(s) {
  var map = { 'Scheduled':'badge-blue','Checked-in':'badge-orange','Waiting':'badge-yellow','Completed':'badge-green','Cancelled':'badge-red' };
  return '<span class="badge ' + (map[s]||'badge-grey') + '">' + s + '</span>';
}

// ── API shortcuts (match old apiFetch interface) ──────────────────────────────
var API_UTILS = {
  gasGet: gasGet, gasPost: gasPost,
  getMe: getMe, login: login, logout: logout, requireAuth: requireAuth,
  el: el, show: show, hide: hide, setText: setText, showToast: showToast,
  fmtDate: fmtDate, fmtTime: fmtTime, statusBadge: statusBadge,
};
window.API_UTILS = API_UTILS;
