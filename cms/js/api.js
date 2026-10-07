/**
 * Sanjeevani CMS – Shared frontend utilities
 * API base, auth helpers, fetch wrapper
 * Same-origin deployment: /api always points to the same server.
 */

const API = '/api';

// ── Fetch wrapper ─────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body instanceof FormData ? options.body : (options.body ? JSON.stringify(options.body) : undefined),
  });
  if (options.body instanceof FormData) {
    delete options.headers?.['Content-Type']; // Let browser set boundary
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function getMe() {
  try { return (await apiFetch('/auth/me')).user; } catch { return null; }
}

async function logout() {
  await apiFetch('/auth/logout', { method: 'POST' });
  window.location.href = '/';
}

async function requireAuth(expectedRole) {
  const user = await getMe();
  if (!user) { window.location.href = `/${expectedRole}/login.html`; return null; }
  if (expectedRole && user.role !== expectedRole) {
    window.location.href = `/${user.role}/dashboard.html`;
    return null;
  }
  return user;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }
function show(id) { const e = el(id); if (e) e.style.display = ''; }
function hide(id) { const e = el(id); if (e) e.style.display = 'none'; }
function setText(id, text) { const e = el(id); if (e) e.textContent = text; }
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => { t.style.display = 'none'; }, 3500);
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(t) {
  if (!t) return '—';
  const [h, m] = t.split(':');
  const ampm = +h >= 12 ? 'PM' : 'AM';
  return `${(+h % 12 || 12)}:${m} ${ampm}`;
}
function statusBadge(s) {
  const map = {
    Scheduled: 'badge-blue', 'Checked-in': 'badge-orange',
    Waiting: 'badge-yellow', Completed: 'badge-green', Cancelled: 'badge-red',
  };
  return `<span class="badge ${map[s] || 'badge-grey'}">${s}</span>`;
}

window.API_UTILS = { apiFetch, getMe, logout, requireAuth, el, show, hide, setText, showToast, fmtDate, fmtTime, statusBadge };
