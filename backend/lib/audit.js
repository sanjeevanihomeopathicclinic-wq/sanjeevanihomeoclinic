/**
 * Audit logger — writes to in-memory log (mock) or Google Sheets (production).
 */

const mock = require('../lib/mockData');

async function logAudit({ userId, userRole, action, resource, resourceId, detail, ip }) {
  const entry = {
    id: `AUD-${Date.now()}`,
    timestamp: new Date().toISOString(),
    userId: userId || 'anonymous',
    userRole: userRole || 'unknown',
    action,
    resource,
    resourceId: resourceId || '',
    detail: detail || '',
    ip: ip || '',
  };

  if (process.env.USE_MOCK_DATA === 'true') {
    mock.AUDIT_LOG.push(entry);
    return;
  }

  // Production: append to Google Sheets AuditLog tab
  try {
    const { getSheetsClient } = require('../lib/googleClient');
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: 'AuditLog!A:J',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[
          entry.id, entry.timestamp, entry.userId, entry.userRole,
          entry.action, entry.resource, entry.resourceId, entry.detail, entry.ip,
        ]],
      },
    });
  } catch (err) {
    console.error('[AUDIT LOG ERROR]', err.message);
  }
}

/**
 * Express middleware: auto-log every state-changing API call
 */
function auditMiddleware(req, res, next) {
  const user = req.session && req.session.user;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    logAudit({
      userId: user ? user.id : null,
      userRole: user ? user.role : null,
      action: req.method,
      resource: req.path,
      ip: req.ip,
    }).catch(() => {});
  }
  next();
}

module.exports = { logAudit, auditMiddleware };
