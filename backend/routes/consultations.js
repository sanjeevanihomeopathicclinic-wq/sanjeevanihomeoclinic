const express = require('express');
const router = express.Router();
const mock = require('../lib/mockData');
const { requireAuth, requireRole, requirePatientOwnership } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

router.use(requireAuth);

// ── GET /api/consultations?patientId=xxx ──────────────────────────────────────
router.get('/', (req, res) => {
  const user = req.session.user;
  const { patientId } = req.query;
  let list = mock.CONSULTATIONS;

  if (user.role === 'patient') {
    list = list.filter(c => c.patientId === user.patientId);
    // Strip doctor-only internal notes from patient view
    list = list.map(c => {
      const { doctorNotes, ...safe } = c;
      return safe;
    });
  } else if (patientId) {
    list = list.filter(c => c.patientId === patientId);
  }

  list = [...list].sort((a, b) => b.date.localeCompare(a.date));
  res.json({ consultations: list });
});

// ── GET /api/consultations/:id ────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const user = req.session.user;
  const con = mock.CONSULTATIONS.find(c => c.consultationId === req.params.id);
  if (!con) return res.status(404).json({ error: 'Consultation not found.' });

  if (user.role === 'patient') {
    if (con.patientId !== user.patientId) return res.status(403).json({ error: 'Access denied.' });
    const { doctorNotes, ...safe } = con;
    return res.json({ consultation: safe });
  }
  res.json({ consultation: con });
});

// ── POST /api/consultations (Doctor only) ─────────────────────────────────────
router.post('/', requireRole('doctor'), async (req, res) => {
  try {
    const { patientId, appointmentId, chiefComplaint, diagnosis, prescription, advice, followUpDate, doctorNotes } = req.body;
    if (!patientId || !chiefComplaint) {
      return res.status(400).json({ error: 'Patient ID and chief complaint are required.' });
    }

    const consultationId = mock.nextConsultationId();
    const newCon = {
      consultationId, patientId, appointmentId: appointmentId || '',
      date: new Date().toISOString().split('T')[0],
      chiefComplaint, diagnosis: diagnosis || '',
      prescription: prescription || '', advice: advice || '',
      followUpDate: followUpDate || '', doctorNotes: doctorNotes || '',
      createdBy: req.session.user.id,
    };
    mock.CONSULTATIONS.push(newCon);

    // Update appointment status to Completed
    if (appointmentId) {
      const appt = mock.APPOINTMENTS.find(a => a.appointmentId === appointmentId);
      if (appt) appt.status = 'Completed';
    }

    await logAudit({
      userId: req.session.user.id, userRole: 'doctor',
      action: 'CREATE', resource: 'consultation', resourceId: consultationId, ip: req.ip,
    });
    res.status(201).json({ success: true, consultation: newCon });
  } catch (err) {
    console.error('[CONSULTATIONS POST]', err);
    res.status(500).json({ error: 'Failed to save consultation.' });
  }
});

// ── PUT /api/consultations/:id (Doctor only) ──────────────────────────────────
router.put('/:id', requireRole('doctor'), async (req, res) => {
  try {
    const idx = mock.CONSULTATIONS.findIndex(c => c.consultationId === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Consultation not found.' });

    const updatable = ['chiefComplaint', 'diagnosis', 'prescription', 'advice', 'followUpDate', 'doctorNotes'];
    for (const f of updatable) {
      if (req.body[f] !== undefined) mock.CONSULTATIONS[idx][f] = req.body[f];
    }

    await logAudit({
      userId: req.session.user.id, userRole: 'doctor',
      action: 'UPDATE', resource: 'consultation', resourceId: req.params.id, ip: req.ip,
    });
    res.json({ success: true, consultation: mock.CONSULTATIONS[idx] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update consultation.' });
  }
});

module.exports = router;
