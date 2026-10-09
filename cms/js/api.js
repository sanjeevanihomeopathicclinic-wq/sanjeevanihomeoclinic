/**
 * Sanjeevani CMS – Shared frontend API utilities
 * Backend: Express server with session-cookie auth at /api/auth
 */

// ── Base path helper (works on GitHub Pages /repo-name/ AND on root domains /)
var _APP_FOLDERS = ['doctor','reception','patient','cms'];
function _basePath() {
  var p = window.location.pathname;
  var parts = p.replace(/^\//, '').split('/');
  if (_APP_FOLDERS.indexOf(parts[0]) !== -1) return '/';
  return '/' + parts[0] + '/';
}

// ── API base URL (same origin — works on Render and locally) ─────────────────
function _apiBase() {
  return window.location.origin;
}

// ── Core fetch helper ─────────────────────────────────────────────────────────
async function apiFetch(path, options) {
  options = options || {};
  options.credentials = 'include'; // send session cookie
  options.headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  var res = await fetch(_apiBase() + path, options);
  var data;
  try { data = await res.json(); } catch(e) { throw new Error('Server returned non-JSON response'); }
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}

// ── User storage (localStorage survives navigation, sessionStorage doesn't) ──
function getCachedUser()  { try { return JSON.parse(localStorage.getItem('sj_user') || 'null'); } catch { return null; } }
function setCachedUser(u) { if (u) localStorage.setItem('sj_user', JSON.stringify(u)); else localStorage.removeItem('sj_user'); }

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function getMe() {
  try {
    var data = await apiFetch('/api/auth/me');
    setCachedUser(data.user);
    return data.user;
  } catch {
    // Cookie may not have arrived yet — fall back to localStorage set at login
    return getCachedUser();
  }
}

async function login(email, password) {
  var data = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: email, password: password }),
  });
  setCachedUser(data.user);
  return data.user;
}

async function logout() {
  try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
  setCachedUser(null);
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

// ── Generic API shortcuts ─────────────────────────────────────────────────────
async function apiGet(path) {
  return apiFetch(path);
}
async function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
}
async function apiPut(path, body) {
  return apiFetch(path, { method: 'PUT', body: JSON.stringify(body) });
}
async function apiPatch(path, body) {
  return apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
}
async function apiDelete(path) {
  return apiFetch(path, { method: 'DELETE' });
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

// ── Exports ───────────────────────────────────────────────────────────────────
var API_UTILS = {
  apiFetch: apiFetch,
  apiGet: apiGet, apiPost: apiPost, apiPut: apiPut, apiPatch: apiPatch, apiDelete: apiDelete,
  getMe: getMe, login: login, logout: logout, requireAuth: requireAuth,
  el: el, show: show, hide: hide, setText: setText, showToast: showToast,
  fmtDate: fmtDate, fmtTime: fmtTime, statusBadge: statusBadge,
};
window.API_UTILS = API_UTILS;
