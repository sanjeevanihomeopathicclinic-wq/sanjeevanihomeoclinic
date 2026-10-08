/**
 * SANJEEVANI CLINIC — Google Apps Script Backend
 * ─────────────────────────────────────────────
 * Deployed as a Web App from sanjeevanihomeopathicclinic@gmail.com
 * Always-on, no cold starts, free forever.
 *
 * SETUP INSTRUCTIONS (one-time):
 * 1. Go to https://script.google.com → New Project → paste this code.
 * 2. Deploy → New deployment → Type: Web App
 *    - Execute as: Me (sanjeevanihomeopathicclinic@gmail.com)
 *    - Who has access: Anyone
 * 3. Copy the Web App URL and paste it into cms/js/config.js on GitHub.
 * 4. Create a Google Sheet named "SanjeevaniDB" in your Drive.
 *    The script auto-creates all required tabs on first run.
 *
 * SECURITY: Passwords are hashed with a simple salted SHA-256.
 * Sessions are signed tokens stored in CacheService (15-min TTL, extendable).
 * Patient data is never exposed without a valid session token.
 */

// ── Config ────────────────────────────────────────────────────────────────────
var SHEET_NAME  = 'SanjeevaniDB';
var SESSION_TTL = 8 * 60 * 60; // 8 hours in seconds
var SALT        = 'SanjeevaniClinic2025!'; // Change this before first deploy

// ── Sheet tab names ───────────────────────────────────────────────────────────
var TABS = {
  users:         'Users',
  patients:      'Patients',
  appointments:  'Appointments',
  consultations: 'Consultations',
  payments:      'Payments',
  auditLog:      'AuditLog',
};

// ── CORS helper ───────────────────────────────────────────────────────────────
function corsResponse(data, status) {
  var output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

function jsonOk(data)  { return corsResponse(data, 200); }
function jsonErr(msg, code) { return corsResponse({ error: msg, code: code || 400 }); }

// ── Entry point ───────────────────────────────────────────────────────────────
// All requests come in as GET (avoids CORS preflight).
// POST-like actions pass body as base64-encoded "payload" query param.
function doGet(e) {
  try {
    var action = e.parameter.action || '';
    var token  = e.parameter.token  || '';
    var params = e.parameter;

    // Decode payload for write actions
    var body = {};
    if (e.parameter.payload) {
      try { body = JSON.parse(decodeURIComponent(escape(Utilities.newBlob(Utilities.base64Decode(e.parameter.payload)).getDataAsString()))); } catch(ex) {}
    }

    // Read actions
    if (action === 'health')        return jsonOk({ status: 'ok', ts: new Date().toISOString() });
    if (action === 'me')            return handleMe(token);
    if (action === 'patients')      return requireRole(token, ['doctor','receptionist'], function(u){ return handleGetPatients(params, u); });
    if (action === 'patient')       return requireRole(token, ['doctor','receptionist','patient'], function(u){ return handleGetPatient(params, u); });
    if (action === 'appointments')  return requireRole(token, ['doctor','receptionist','patient'], function(u){ return handleGetAppointments(params, u); });
    if (action === 'todayApts')     return requireRole(token, ['doctor','receptionist'], function(u){ return handleTodayApts(u); });
    if (action === 'consultations') return requireRole(token, ['doctor','receptionist','patient'], function(u){ return handleGetConsultations(params, u); });
    if (action === 'payments')      return requireRole(token, ['doctor','receptionist'], function(u){ return handleGetPayments(params, u); });
    if (action === 'audit')         return requireRole(token, ['doctor'], function(u){ return handleGetAudit(u); });

    // Write actions (body decoded from payload param)
    if (action === 'login')    return handleLogin(body);
    if (action === 'logout')   return handleLogout(token);
    if (action === 'register') return handleRegister(body);

    if (action === 'createPatient')      return requireRole(token, ['doctor','receptionist'], function(u){ return handleCreatePatient(body, u); });
    if (action === 'updatePatient')      return requireRole(token, ['doctor','receptionist','patient'], function(u){ return handleUpdatePatient(body, u); });
    if (action === 'createAppointment')  return requireRole(token, ['doctor','receptionist','patient'], function(u){ return handleCreateAppointment(body, u); });
    if (action === 'updateAppointment')  return requireRole(token, ['doctor','receptionist','patient'], function(u){ return handleUpdateAppointment(body, u); });
    if (action === 'createConsultation') return requireRole(token, ['doctor'], function(u){ return handleCreateConsultation(body, u); });
    if (action === 'updateConsultation') return requireRole(token, ['doctor'], function(u){ return handleUpdateConsultation(body, u); });
    if (action === 'createPayment')      return requireRole(token, ['doctor','receptionist'], function(u){ return handleCreatePayment(body, u); });

    return jsonErr('Unknown action');
  } catch(ex) {
    return jsonErr('Server error: ' + ex.message, 500);
  }
}

// doPost kept for direct API testing via curl/Postman
function doPost(e) { return doGet(e); }

// ── Auth ──────────────────────────────────────────────────────────────────────
function hashPassword(pw) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    SALT + pw + SALT,
    Utilities.Charset.UTF_8
  );
  return raw.map(function(b){ return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function createToken(userId, role) {
  var token = Utilities.base64Encode(
    userId + ':' + role + ':' + Date.now() + ':' + Math.random()
  );
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify({ userId: userId, role: role }), SESSION_TTL);
  return token;
}

function getSession(token) {
  if (!token) return null;
  var val = CacheService.getScriptCache().get('tok_' + token);
  if (!val) return null;
  return JSON.parse(val);
}

function destroySession(token) {
  if (token) CacheService.getScriptCache().remove('tok_' + token);
}

function requireRole(token, roles, fn) {
  var sess = getSession(token);
  if (!sess) return jsonErr('Authentication required.', 401);
  if (roles.indexOf(sess.role) === -1) return jsonErr('Access denied.', 403);
  // Refresh TTL on activity
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify(sess), SESSION_TTL);
  var user = getUserById(sess.userId);
  if (!user) return jsonErr('User not found.', 401);
  return fn(user);
}

function handleLogin(body) {
  var email = (body.email || '').toLowerCase().trim();
  var pw    = body.password || '';
  if (!email || !pw) return jsonErr('Email and password are required.');

  var user = getUserByEmail(email);
  if (!user) return jsonErr('Invalid email or password.', 401);

  var hash = hashPassword(pw);
  if (user.passwordHash !== hash) {
    logAudit(user.id, user.role, 'LOGIN_FAIL', 'auth', user.id);
    return jsonErr('Invalid email or password.', 401);
  }

  var token = createToken(user.id, user.role);
  logAudit(user.id, user.role, 'LOGIN', 'auth', user.id);
  return jsonOk({
    success: true,
    token: token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, patientId: user.patientId || null }
  });
}

function handleLogout(token) {
  var sess = getSession(token);
  if (sess) logAudit(sess.userId, sess.role, 'LOGOUT', 'auth', sess.userId);
  destroySession(token);
  return jsonOk({ success: true });
}

function handleMe(token) {
  var sess = getSession(token);
  if (!sess) return jsonErr('Not authenticated.', 401);
  var user = getUserById(sess.userId);
  if (!user) return jsonErr('User not found.', 401);
  return jsonOk({ user: { id: user.id, name: user.name, email: user.email, role: user.role, patientId: user.patientId || null } });
}

function handleRegister(body) {
  var name  = body.name || '';
  var email = (body.email || '').toLowerCase().trim();
  var pw    = body.password || '';
  var phone = body.phone || '';
  if (!name || !email || !pw || !phone) return jsonErr('Name, email, password and phone are required.');
  if (pw.length < 8) return jsonErr('Password must be at least 8 characters.');
  if (getUserByEmail(email)) return jsonErr('An account with this email already exists.', 409);

  var patientId = nextId('PAT', getSheet(TABS.patients));
  var userId    = nextId('USR', getSheet(TABS.users));
  var hash      = hashPassword(pw);

  appendRow(TABS.users, [userId, name, email, hash, 'patient', patientId, phone]);
  appendRow(TABS.patients, [patientId, name, body.dob||'', body.gender||'', phone, email, '', '', '', today(), userId]);

  var token = createToken(userId, 'patient');
  logAudit(userId, 'patient', 'REGISTER', 'auth', userId);
  return jsonOk({ success: true, token: token, user: { id: userId, name: name, email: email, role: 'patient', patientId: patientId } });
}

// ── Patients ──────────────────────────────────────────────────────────────────
function handleGetPatients(params, user) {
  var rows = getSheetData(TABS.patients);
  var q    = (params.q || '').toLowerCase();
  if (q) {
    rows = rows.filter(function(r) {
      return (r.name||'').toLowerCase().indexOf(q) > -1 ||
             (r.patientId||'').toLowerCase().indexOf(q) > -1 ||
             (r.phone||'').indexOf(q) > -1;
    });
  }
  return jsonOk({ patients: rows });
}

function handleGetPatient(params, user) {
  var pid = params.patientId || '';
  if (user.role === 'patient' && user.patientId !== pid) return jsonErr('Access denied.', 403);
  var row = findRow(TABS.patients, 'patientId', pid);
  if (!row) return jsonErr('Patient not found.', 404);
  return jsonOk({ patient: row });
}

function handleCreatePatient(body, user) {
  if (!body.name || !body.phone) return jsonErr('Name and phone are required.');
  var patientId = nextId('PAT', getSheet(TABS.patients));
  var row = [patientId, body.name, body.dob||'', body.gender||'', body.phone, body.email||'',
             body.address||'', body.bloodGroup||'', body.allergies||'', today(), ''];
  appendRow(TABS.patients, row);
  logAudit(user.id, user.role, 'CREATE', 'patient', patientId);
  return jsonOk({ success: true, patient: rowToPatient(row) });
}

function handleUpdatePatient(body, user) {
  var pid = body.patientId || '';
  if (user.role === 'patient' && user.patientId !== pid) return jsonErr('Access denied.', 403);
  var sheet = getSheet(TABS.patients);
  var data  = sheet.getDataRange().getValues();
  var cols  = data[0];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === pid) {
      var allowed = ['name','phone','email','address','bloodGroup','allergies','dob','gender'];
      allowed.forEach(function(k) {
        if (body[k] !== undefined) {
          var ci = cols.indexOf(k);
          if (ci > -1) sheet.getRange(i+1, ci+1).setValue(body[k]);
        }
      });
      logAudit(user.id, user.role, 'UPDATE', 'patient', pid);
      return jsonOk({ success: true });
    }
  }
  return jsonErr('Patient not found.', 404);
}

// ── Appointments ──────────────────────────────────────────────────────────────
function handleGetAppointments(params, user) {
  var rows = getSheetData(TABS.appointments);
  if (user.role === 'patient') rows = rows.filter(function(r){ return r.patientId === user.patientId; });
  if (params.date) rows = rows.filter(function(r){ return r.date === params.date; });
  if (params.patientId && user.role !== 'patient') rows = rows.filter(function(r){ return r.patientId === params.patientId; });
  rows.sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); });
  return jsonOk({ appointments: rows });
}

function handleTodayApts(user) {
  var t    = today();
  var rows = getSheetData(TABS.appointments).filter(function(r){ return r.date === t; });
  rows.sort(function(a,b){ return a.time.localeCompare(b.time); });
  return jsonOk({ appointments: rows, date: t });
}

function handleCreateAppointment(body, user) {
  var pid  = user.role === 'patient' ? user.patientId : (body.patientId || '');
  var date = body.date || '';
  var time = body.time || '';
  if (!pid || !date || !time) return jsonErr('Patient ID, date and time are required.');
  var patient = findRow(TABS.patients, 'patientId', pid);
  if (!patient) return jsonErr('Patient not found.', 404);
  var aptId = nextId('APT', getSheet(TABS.appointments));
  var row   = [aptId, pid, patient.name, date, time, body.type||'New Consultation', 'Scheduled', body.notes||'', body.fee||500, 'false'];
  appendRow(TABS.appointments, row);
  logAudit(user.id, user.role, 'CREATE', 'appointment', aptId);
  return jsonOk({ success: true, appointment: rowToAppointment(row) });
}

function handleUpdateAppointment(body, user) {
  var aptId = body.appointmentId || '';
  var sheet = getSheet(TABS.appointments);
  var data  = sheet.getDataRange().getValues();
  var cols  = data[0];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === aptId) {
      if (user.role === 'patient' && data[i][1] !== user.patientId) return jsonErr('Access denied.', 403);
      var allowed = user.role === 'patient'
        ? ['status','date','time','notes']
        : ['date','time','type','status','notes','fee','feePaid'];
      allowed.forEach(function(k) {
        if (body[k] !== undefined) {
          var ci = cols.indexOf(k);
          if (ci > -1) sheet.getRange(i+1, ci+1).setValue(String(body[k]));
        }
      });
      logAudit(user.id, user.role, 'UPDATE', 'appointment', aptId);
      return jsonOk({ success: true });
    }
  }
  return jsonErr('Appointment not found.', 404);
}

// ── Consultations ─────────────────────────────────────────────────────────────
function handleGetConsultations(params, user) {
  var rows = getSheetData(TABS.consultations);
  if (user.role === 'patient') {
    rows = rows.filter(function(r){ return r.patientId === user.patientId; });
    rows = rows.map(function(r){ var c = JSON.parse(JSON.stringify(r)); delete c.doctorNotes; return c; });
  } else if (params.patientId) {
    rows = rows.filter(function(r){ return r.patientId === params.patientId; });
  }
  rows.sort(function(a,b){ return b.date.localeCompare(a.date); });
  return jsonOk({ consultations: rows });
}

function handleCreateConsultation(body, user) {
  if (!body.patientId || !body.chiefComplaint) return jsonErr('Patient ID and chief complaint are required.');
  var cid = nextId('CON', getSheet(TABS.consultations));
  var row = [cid, body.patientId, body.appointmentId||'', today(),
             body.chiefComplaint, body.diagnosis||'', body.prescription||'',
             body.advice||'', body.followUpDate||'', body.doctorNotes||'', user.id];
  appendRow(TABS.consultations, row);
  // Mark appointment completed
  if (body.appointmentId) {
    var aSheet = getSheet(TABS.appointments);
    var aData  = aSheet.getDataRange().getValues();
    var aCols  = aData[0];
    for (var i = 1; i < aData.length; i++) {
      if (aData[i][0] === body.appointmentId) {
        aSheet.getRange(i+1, aCols.indexOf('status')+1).setValue('Completed');
        break;
      }
    }
  }
  logAudit(user.id, user.role, 'CREATE', 'consultation', cid);
  return jsonOk({ success: true, consultation: rowToConsultation(row) });
}

function handleUpdateConsultation(body, user) {
  var cid   = body.consultationId || '';
  var sheet = getSheet(TABS.consultations);
  var data  = sheet.getDataRange().getValues();
  var cols  = data[0];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === cid) {
      ['chiefComplaint','diagnosis','prescription','advice','followUpDate','doctorNotes'].forEach(function(k){
        if (body[k] !== undefined) {
          var ci = cols.indexOf(k);
          if (ci > -1) sheet.getRange(i+1, ci+1).setValue(body[k]);
        }
      });
      logAudit(user.id, user.role, 'UPDATE', 'consultation', cid);
      return jsonOk({ success: true });
    }
  }
  return jsonErr('Consultation not found.', 404);
}

// ── Payments ──────────────────────────────────────────────────────────────────
function handleGetPayments(params, user) {
  var rows = getSheetData(TABS.payments);
  if (params.patientId) rows = rows.filter(function(r){ return r.patientId === params.patientId; });
  return jsonOk({ payments: rows });
}

function handleCreatePayment(body, user) {
  if (!body.appointmentId || !body.amount) return jsonErr('Appointment ID and amount required.');
  var pid = nextId('PAY', getSheet(TABS.payments));
  var row = [pid, body.appointmentId, body.patientId||'', body.amount, body.mode||'Cash', today(), 'Paid'];
  appendRow(TABS.payments, row);
  // Mark appointment fee paid
  var aSheet = getSheet(TABS.appointments);
  var aData  = aSheet.getDataRange().getValues();
  var aCols  = aData[0];
  for (var i = 1; i < aData.length; i++) {
    if (aData[i][0] === body.appointmentId) {
      aSheet.getRange(i+1, aCols.indexOf('feePaid')+1).setValue('true');
      break;
    }
  }
  logAudit(user.id, user.role, 'CREATE', 'payment', pid);
  return jsonOk({ success: true, payment: { paymentId: row[0], appointmentId: row[1], patientId: row[2], amount: row[3], mode: row[4], date: row[5], status: row[6] } });
}

function handleGetAudit(user) {
  var rows = getSheetData(TABS.auditLog);
  rows.reverse();
  return jsonOk({ log: rows.slice(0, 200) });
}

// ── Sheet helpers ─────────────────────────────────────────────────────────────
function getSpreadsheet() {
  var files = DriveApp.getFilesByName(SHEET_NAME);
  if (files.hasNext()) {
    return SpreadsheetApp.open(files.next());
  }
  var ss = SpreadsheetApp.create(SHEET_NAME);
  initSheets(ss);
  return ss;
}

function getSheet(tabName) {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    initTab(sheet, tabName);
  }
  return sheet;
}

function initSheets(ss) {
  Object.keys(TABS).forEach(function(k){ initTab(ss.insertSheet(TABS[k]), TABS[k]); });
  // Remove default sheet
  var def = ss.getSheetByName('Sheet1');
  if (def) ss.deleteSheet(def);
  seedUsers(ss);
}

function initTab(sheet, tabName) {
  var headers = {
    Users:         ['id','name','email','passwordHash','role','patientId','phone'],
    Patients:      ['patientId','name','dob','gender','phone','email','address','bloodGroup','allergies','registeredOn','userId'],
    Appointments:  ['appointmentId','patientId','patientName','date','time','type','status','notes','fee','feePaid'],
    Consultations: ['consultationId','patientId','appointmentId','date','chiefComplaint','diagnosis','prescription','advice','followUpDate','doctorNotes','createdBy'],
    Payments:      ['paymentId','appointmentId','patientId','amount','mode','date','status'],
    AuditLog:      ['id','timestamp','userId','userRole','action','resource','resourceId'],
  };
  if (headers[tabName]) {
    sheet.getRange(1, 1, 1, headers[tabName].length).setValues([headers[tabName]]);
    sheet.getRange(1, 1, 1, headers[tabName].length).setFontWeight('bold');
  }
}

function seedUsers(ss) {
  var sheet = ss.getSheetByName(TABS.users);
  sheet.appendRow(['u-001', 'Dr. T. Srinivas',  'doctor@sanjeevani.clinic',     hashPassword('Doctor@123'), 'doctor',       '', '9912322251']);
  sheet.appendRow(['u-002', 'Receptionist',      'reception@sanjeevani.clinic',  hashPassword('Recep@123'),  'receptionist', '', '08724222977']);
}

function getSheetData(tabName) {
  var sheet = getSheet(tabName);
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var cols = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    cols.forEach(function(c, i){ obj[c] = String(row[i] === null || row[i] === undefined ? '' : row[i]); });
    return obj;
  });
}

function findRow(tabName, key, value) {
  var rows = getSheetData(tabName);
  return rows.find(function(r){ return r[key] === value; }) || null;
}

function appendRow(tabName, row) {
  getSheet(tabName).appendRow(row);
}

function nextId(prefix, sheet) {
  var count = Math.max(sheet.getLastRow() - 1, 0);
  return prefix + '-' + String(count + 1).padStart(4, '0');
}

function today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ── User helpers ──────────────────────────────────────────────────────────────
function getUserByEmail(email) {
  var rows = getSheetData(TABS.users);
  return rows.find(function(r){ return (r.email||'').toLowerCase() === email; }) || null;
}

function getUserById(id) {
  var rows = getSheetData(TABS.users);
  return rows.find(function(r){ return r.id === id; }) || null;
}

// ── Row converters ────────────────────────────────────────────────────────────
function rowToPatient(row) {
  return { patientId:row[0], name:row[1], dob:row[2], gender:row[3], phone:row[4],
           email:row[5], address:row[6], bloodGroup:row[7], allergies:row[8],
           registeredOn:row[9], userId:row[10] };
}
function rowToAppointment(row) {
  return { appointmentId:row[0], patientId:row[1], patientName:row[2], date:row[3],
           time:row[4], type:row[5], status:row[6], notes:row[7], fee:row[8], feePaid:row[9]==='true' };
}
function rowToConsultation(row) {
  return { consultationId:row[0], patientId:row[1], appointmentId:row[2], date:row[3],
           chiefComplaint:row[4], diagnosis:row[5], prescription:row[6], advice:row[7],
           followUpDate:row[8], doctorNotes:row[9], createdBy:row[10] };
}

// ── Audit ─────────────────────────────────────────────────────────────────────
function logAudit(userId, role, action, resource, resourceId) {
  try {
    appendRow(TABS.auditLog, [
      'AUD-' + Date.now(), new Date().toISOString(),
      userId||'', role||'', action, resource, resourceId||''
    ]);
  } catch(ex) { /* non-fatal */ }
}
