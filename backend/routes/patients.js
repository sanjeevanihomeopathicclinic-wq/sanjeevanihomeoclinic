const express = require('express');
const router = express.Router();
const mock = require('../lib/mockData');
const { requireAuth, requireRole, requirePatientOwnership } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

// All patient routes require authentication
router.use(requireAuth);

// ── GET /api/patients ─────────────────────────────────────────────────────────
// Doctor + Receptionist: list all patients (with optional search)
router.get('/', requireRole(['doctor', 'receptionist']), (req, res) => {
  const { q } = req.query;
  let list = mock.PATIENTS;
  if (q) {
    const search = q.toLowerCase();
    list = list.filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.patientId.toLowerCase().includes(search) ||
      p.phone.includes(search) ||
      (p.email || '').toLowerCase().includes(search)
    );
  }
  // Never expose passwordHash; strip sensitive notes for receptionist query
  res.json({ patients: list });
});

// ── GET /api/patients/:patientId ──────────────────────────────────────────────
router.get('/:patientId', requirePatientOwnership, (req, res) => {
  const patient = mock.PATIENTS.find(p => p.patientId === req.params.patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found.' });
  res.json({ patient });
});

// ── POST /api/patients ────────────────────────────────────────────────────────
// Receptionist or Doctor registers a new (offline) patient
router.post('/', requireRole(['doctor', 'receptionist']), async (req, res) => {
  try {
    const { name, dob, gender, phone, email, address, bloodGroup, allergies } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'Name and phone are required.' });

    const patientId = mock.nextPatientId();
    const newPatient = {
      patientId, name, dob: dob || '', gender: gender || '', phone,
      email: email || '', address: address || '', bloodGroup: bloodGroup || '',
      allergies: allergies || '', registeredOn: new Date().toISOString().split('T')[0], userId: null,
    };
    mock.PATIENTS.push(newPatient);

    await logAudit({
      userId: req.session.user.id, userRole: req.session.user.role,
      action: 'CREATE', resource: 'patient', resourceId: patientId, ip: req.ip,
    });
    res.status(201).json({ success: true, patient: newPatient });
  } catch (err) {
    console.error('[PATIENTS POST]', err);
    res.status(500).json({ error: 'Failed to register patient.' });
  }
});

// ── PUT /api/patients/:patientId ──────────────────────────────────────────────
// Receptionist/Doctor: update basic details. Patient: update own non-clinical fields.
router.put('/:patientId', requirePatientOwnership, async (req, res) => {
  try {
    const idx = mock.PATIENTS.findIndex(p => p.patientId === req.params.patientId);
    if (idx === -1) return res.status(404).json({ error: 'Patient not found.' });

    const allowed = ['name', 'phone', 'email', 'address', 'bloodGroup', 'allergies', 'dob', 'gender'];
    // Patients cannot update clinical fields
    const role = req.session.user.role;
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    Object.assign(mock.PATIENTS[idx], updates);
    await logAudit({
      userId: req.session.user.id, userRole: role,
      action: 'UPDATE', resource: 'patient', resourceId: req.params.patientId, ip: req.ip,
    });
    res.json({ success: true, patient: mock.PATIENTS[idx] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update patient.' });
  }
});

module.exports = router;
