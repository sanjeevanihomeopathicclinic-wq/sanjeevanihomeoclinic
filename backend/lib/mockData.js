/**
 * Mock data store — used when USE_MOCK_DATA=true
 * Simulates Google Sheets rows. Replace with real Sheets calls after
 * connecting your Google account.
 */

// uuid v11 uses named export
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// ── Users (hashed passwords) ──────────────────────────────────────────────────
const USERS = [
  {
    id: 'u-001',
    email: 'doctor@sanjeevani.clinic',
    passwordHash: bcrypt.hashSync('Doctor@123', 10),
    role: 'doctor',
    name: 'Dr. T. Srinivas',
    phone: '9912322251',
  },
  {
    id: 'u-002',
    email: 'reception@sanjeevani.clinic',
    passwordHash: bcrypt.hashSync('Recep@123', 10),
    role: 'receptionist',
    name: 'Receptionist',
    phone: '08724222977',
  },
  {
    id: 'u-003',
    email: 'patient1@example.com',
    passwordHash: bcrypt.hashSync('Patient@123', 10),
    role: 'patient',
    name: 'Ravi Kumar',
    patientId: 'PAT-0001',
    phone: '9876543210',
  },
  {
    id: 'u-004',
    email: 'patient2@example.com',
    passwordHash: bcrypt.hashSync('Patient@123', 10),
    role: 'patient',
    name: 'Priya Sharma',
    patientId: 'PAT-0002',
    phone: '9876543211',
  },
];

// ── Patients ──────────────────────────────────────────────────────────────────
const PATIENTS = [
  {
    patientId: 'PAT-0001',
    name: 'Ravi Kumar',
    dob: '1988-04-12',
    gender: 'Male',
    phone: '9876543210',
    email: 'patient1@example.com',
    address: 'H.No 12, Gandhi Nagar, Jagtial',
    bloodGroup: 'O+',
    allergies: 'None known',
    registeredOn: '2024-01-10',
    userId: 'u-003',
  },
  {
    patientId: 'PAT-0002',
    name: 'Priya Sharma',
    dob: '1994-09-22',
    gender: 'Female',
    phone: '9876543211',
    email: 'patient2@example.com',
    address: 'Flat 4B, Ashok Nagar, Jagtial',
    bloodGroup: 'A+',
    allergies: 'Dust allergy',
    registeredOn: '2024-02-18',
    userId: 'u-004',
  },
  {
    patientId: 'PAT-0003',
    name: 'Suresh Reddy',
    dob: '1975-06-30',
    gender: 'Male',
    phone: '9876543212',
    email: 'suresh.r@example.com',
    address: 'Village Rd, Korutla, Jagtial',
    bloodGroup: 'B+',
    allergies: 'None',
    registeredOn: '2024-03-05',
    userId: null,
  },
];

// ── Appointments ──────────────────────────────────────────────────────────────
const today = new Date().toISOString().split('T')[0];
const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

const APPOINTMENTS = [
  {
    appointmentId: 'APT-0001',
    patientId: 'PAT-0001',
    patientName: 'Ravi Kumar',
    date: today,
    time: '10:00',
    type: 'Follow-up',
    status: 'Checked-in',
    notes: 'Skin complaint follow-up',
    fee: 300,
    feePaid: true,
  },
  {
    appointmentId: 'APT-0002',
    patientId: 'PAT-0002',
    patientName: 'Priya Sharma',
    date: today,
    time: '11:30',
    type: 'New Consultation',
    status: 'Waiting',
    notes: 'Allergic rhinitis',
    fee: 500,
    feePaid: false,
  },
  {
    appointmentId: 'APT-0003',
    patientId: 'PAT-0003',
    patientName: 'Suresh Reddy',
    date: today,
    time: '14:00',
    type: 'Follow-up',
    status: 'Scheduled',
    notes: 'Joint pain review',
    fee: 300,
    feePaid: false,
  },
  {
    appointmentId: 'APT-0004',
    patientId: 'PAT-0001',
    patientName: 'Ravi Kumar',
    date: tomorrow,
    time: '09:30',
    type: 'New Consultation',
    status: 'Scheduled',
    notes: '',
    fee: 500,
    feePaid: false,
  },
];

// ── Consultations ─────────────────────────────────────────────────────────────
const CONSULTATIONS = [
  {
    consultationId: 'CON-0001',
    patientId: 'PAT-0001',
    appointmentId: 'APT-0001',
    date: today,
    chiefComplaint: 'Persistent acne for 6 months',
    diagnosis: 'Acne Vulgaris – constitutional treatment initiated',
    prescription: 'Sulphur 30C – 4 pills twice daily for 3 weeks\nBerberis Aquifolium Q – topical\nDiet: avoid oily foods, dairy',
    advice: 'Maintain a daily skin hygiene routine. Drink adequate water.',
    followUpDate: new Date(Date.now() + 21 * 86400000).toISOString().split('T')[0],
    doctorNotes: 'Patient reports significant improvement in last visit. Skin less inflamed.',
    createdBy: 'u-001',
  },
];

// ── Payments ──────────────────────────────────────────────────────────────────
const PAYMENTS = [
  {
    paymentId: 'PAY-0001',
    appointmentId: 'APT-0001',
    patientId: 'PAT-0001',
    amount: 300,
    mode: 'Cash',
    date: today,
    status: 'Paid',
  },
];

// ── Before/After Cases ────────────────────────────────────────────────────────
const BEFORE_AFTER = [
  {
    caseId: 'BA-0001',
    patientId: 'PAT-0001',
    condition: 'Acne',
    beforeImageUrl: null,
    afterImageUrl: null,
    notes: 'Significant improvement after 6 weeks of constitutional treatment',
    date: today,
  },
];

// ── Audit Log ─────────────────────────────────────────────────────────────────
const AUDIT_LOG = [];

// ── Sequence helpers ──────────────────────────────────────────────────────────
function nextPatientId() {
  const nums = PATIENTS.map(p => parseInt(p.patientId.replace('PAT-', ''), 10));
  return `PAT-${String(Math.max(...nums, 0) + 1).padStart(4, '0')}`;
}
function nextAppointmentId() {
  const nums = APPOINTMENTS.map(a => parseInt(a.appointmentId.replace('APT-', ''), 10));
  return `APT-${String(Math.max(...nums, 0) + 1).padStart(4, '0')}`;
}
function nextConsultationId() {
  const nums = CONSULTATIONS.map(c => parseInt(c.consultationId.replace('CON-', ''), 10));
  return `CON-${String(Math.max(...nums, 0) + 1).padStart(4, '0')}`;
}
function nextPaymentId() {
  const nums = PAYMENTS.map(p => parseInt(p.paymentId.replace('PAY-', ''), 10));
  return `PAY-${String(Math.max(...nums, 0) + 1).padStart(4, '0')}`;
}

module.exports = {
  USERS, PATIENTS, APPOINTMENTS, CONSULTATIONS, PAYMENTS, BEFORE_AFTER, AUDIT_LOG,
  nextPatientId, nextAppointmentId, nextConsultationId, nextPaymentId,
};
