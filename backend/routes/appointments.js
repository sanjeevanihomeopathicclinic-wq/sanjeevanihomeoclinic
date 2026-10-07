const express = require('express');
const router = express.Router();
const mock = require('../lib/mockData');
const { requireAuth, requireRole, requirePatientOwnership } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

router.use(requireAuth);

// ── GET /api/appointments ─────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { date, patientId, status } = req.query;
  const user = req.session.user;
  let list = mock.APPOINTMENTS;

  // Patients see only their own
  if (user.role === 'patient') {
    list = list.filter(a => a.patientId === user.patientId);
  }
  if (date) list = list.filter(a => a.date === date);
  if (patientId && user.role !== 'patient') list = list.filter(a => a.patientId === patientId);
  if (status) list = list.filter(a => a.status === status);

  // Sort by date+time
  list = [...list].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  res.json({ appointments: list });
});

// ── GET /api/appointments/today ───────────────────────────────────────────────
router.get('/today', requireRole(['doctor', 'receptionist']), (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const list = mock.APPOINTMENTS
    .filter(a => a.date === today)
    .sort((a, b) => a.time.localeCompare(b.time));
  res.json({ appointments: list, date: today });
});

// ── GET /api/appointments/:appointmentId ──────────────────────────────────────
router.get('/:appointmentId', (req, res) => {
  const appt = mock.APPOINTMENTS.find(a => a.appointmentId === req.params.appointmentId);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
  const user = req.session.user;
  if (user.role === 'patient' && appt.patientId !== user.patientId) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  res.json({ appointment: appt });
});

// ── POST /api/appointments ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const user = req.session.user;
    const { patientId, date, time, type, notes, fee } = req.body;

    // Patients can only book for themselves
    const pid = user.role === 'patient' ? user.patientId : patientId;
    if (!pid || !date || !time) {
      return res.status(400).json({ error: 'Patient ID, date and time are required.' });
    }

    const patient = mock.PATIENTS.find(p => p.patientId === pid);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const appointmentId = mock.nextAppointmentId();
    const newAppt = {
      appointmentId, patientId: pid, patientName: patient.name,
      date, time, type: type || 'New Consultation',
      status: 'Scheduled', notes: notes || '',
      fee: fee || 500, feePaid: false,
    };
    mock.APPOINTMENTS.push(newAppt);

    await logAudit({
      userId: user.id, userRole: user.role,
      action: 'CREATE', resource: 'appointment', resourceId: appointmentId, ip: req.ip,
    });
    res.status(201).json({ success: true, appointment: newAppt });
  } catch (err) {
    console.error('[APPOINTMENTS POST]', err);
    res.status(500).json({ error: 'Failed to create appointment.' });
  }
});

// ── PUT /api/appointments/:appointmentId ──────────────────────────────────────
router.put('/:appointmentId', async (req, res) => {
  try {
    const user = req.session.user;
    const idx = mock.APPOINTMENTS.findIndex(a => a.appointmentId === req.params.appointmentId);
    if (idx === -1) return res.status(404).json({ error: 'Appointment not found.' });

    const appt = mock.APPOINTMENTS[idx];

    // Patient can only cancel/reschedule their own
    if (user.role === 'patient') {
      if (appt.patientId !== user.patientId) return res.status(403).json({ error: 'Access denied.' });
      const allowedFields = ['status', 'date', 'time', 'notes'];
      const allowedStatuses = ['Cancelled'];
      if (req.body.status && !allowedStatuses.includes(req.body.status) && !['Scheduled'].includes(req.body.status)) {
        return res.status(403).json({ error: 'Patients may only cancel or reschedule appointments.' });
      }
      for (const f of allowedFields) {
        if (req.body[f] !== undefined) appt[f] = req.body[f];
      }
    } else {
      // Doctor/Receptionist: update any field
      const updatable = ['date', 'time', 'type', 'status', 'notes', 'fee', 'feePaid'];
      for (const f of updatable) {
        if (req.body[f] !== undefined) appt[f] = req.body[f];
      }
    }

    await logAudit({
      userId: user.id, userRole: user.role,
      action: 'UPDATE', resource: 'appointment', resourceId: req.params.appointmentId, ip: req.ip,
    });
    res.json({ success: true, appointment: appt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update appointment.' });
  }
});

module.exports = router;
