const express = require('express');
const router = express.Router();
const mock = require('../lib/mockData');
const { requireAuth, requireRole } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

router.use(requireAuth);

// ── GET /api/payments ─────────────────────────────────────────────────────────
router.get('/', requireRole(['doctor', 'receptionist']), (req, res) => {
  const { patientId, date } = req.query;
  let list = mock.PAYMENTS;
  if (patientId) list = list.filter(p => p.patientId === patientId);
  if (date) list = list.filter(p => p.date === date);
  res.json({ payments: list });
});

// ── POST /api/payments ────────────────────────────────────────────────────────
router.post('/', requireRole(['doctor', 'receptionist']), async (req, res) => {
  try {
    const { appointmentId, patientId, amount, mode } = req.body;
    if (!appointmentId || !amount) return res.status(400).json({ error: 'Appointment ID and amount required.' });

    const paymentId = mock.nextPaymentId();
    const payment = {
      paymentId, appointmentId, patientId: patientId || '',
      amount: Number(amount), mode: mode || 'Cash',
      date: new Date().toISOString().split('T')[0], status: 'Paid',
    };
    mock.PAYMENTS.push(payment);

    // Mark appointment fee as paid
    const appt = mock.APPOINTMENTS.find(a => a.appointmentId === appointmentId);
    if (appt) appt.feePaid = true;

    await logAudit({
      userId: req.session.user.id, userRole: req.session.user.role,
      action: 'CREATE', resource: 'payment', resourceId: paymentId, ip: req.ip,
    });
    res.status(201).json({ success: true, payment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record payment.' });
  }
});

module.exports = router;
