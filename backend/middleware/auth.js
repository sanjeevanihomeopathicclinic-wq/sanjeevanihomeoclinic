/**
 * Middleware: require an authenticated session
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  next();
}

/**
 * Middleware factory: restrict to specific roles
 * Usage: requireRole('doctor') or requireRole(['doctor','receptionist'])
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowed.includes(req.session.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient privileges.' });
    }
    next();
  };
}

/**
 * Middleware: patient can only access their own records
 * Expects req.params.patientId or req.body.patientId to match session
 */
function requirePatientOwnership(req, res, next) {
  const { user } = req.session;
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  if (user.role === 'doctor' || user.role === 'receptionist') return next();
  const pid = req.params.patientId || req.body.patientId || req.query.patientId;
  if (user.role === 'patient' && user.patientId === pid) return next();
  return res.status(403).json({ error: 'Access denied. You can only view your own records.' });
}

module.exports = { requireAuth, requireRole, requirePatientOwnership };
