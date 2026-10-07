# Sanjeevani Clinic — Management System

A full clinic management system built on top of the existing Sanjeevani Multispeciality Homeopathic Clinic website.

---

## Architecture

```
sanjeevani-clinic/
├── index.html              ← Public website (unchanged)
├── devserver.js            ← Frontend dev server with /api proxy
├── package.json
├── cms/
│   ├── css/dashboard.css   ← Shared dashboard styles
│   └── js/api.js           ← Shared API utilities
├── doctor/
│   ├── login.html
│   └── dashboard.html
├── reception/
│   ├── login.html
│   └── dashboard.html
├── patient/
│   ├── login.html
│   └── dashboard.html
└── backend/
    ├── server.js           ← Express API server
    ├── package.json
    ├── .env.example        ← Copy to .env and fill in values
    ├── lib/
    │   ├── googleClient.js ← Google Auth (credentials via env vars only)
    │   ├── mockData.js     ← In-memory demo data
    │   └── audit.js        ← Audit logger
    ├── middleware/
    │   └── auth.js         ← requireAuth, requireRole, requirePatientOwnership
    └── routes/
        ├── auth.js
        ├── patients.js
        ├── appointments.js
        ├── consultations.js
        ├── payments.js
        ├── drive.js
        └── audit.js
```

---

## Roles & Access

| Role         | Login URL                  | Access                                          |
|--------------|----------------------------|-------------------------------------------------|
| Doctor       | `/doctor/login.html`       | Full clinical access, audit log, all patients   |
| Receptionist | `/reception/login.html`    | Appointments, patient admin, payments (no clinical notes) |
| Patient      | `/patient/login.html`      | Own records only, book/cancel appointments      |

---

## Demo Credentials (Mock Mode)

| Role         | Email                         | Password     |
|--------------|-------------------------------|--------------|
| Doctor       | doctor@sanjeevani.clinic      | Doctor@123   |
| Receptionist | reception@sanjeevani.clinic   | Recep@123    |
| Patient 1    | patient1@example.com          | Patient@123  |
| Patient 2    | patient2@example.com          | Patient@123  |

---

## Quick Start (Local / Mock Mode)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env — set USE_MOCK_DATA=true for demo (no Google account needed)
npm run dev
# API runs at http://localhost:3001
```

### 2. Frontend Dev Server

```bash
cd ..   # back to sanjeevani-clinic/
npm install
npm run dev
# Frontend at http://localhost:3000
```

Open the portals:
- Doctor: http://localhost:3000/doctor/login.html
- Reception: http://localhost:3000/reception/login.html
- Patient: http://localhost:3000/patient/login.html
- Public site: http://localhost:3000/index.html

---

## Connecting Google Sheets & Drive

1. Create a Google Cloud project and enable **Sheets API** and **Drive API**.
2. Create a **Service Account** and download the JSON key.
3. Create a Google Spreadsheet with tabs: `Patients`, `Appointments`, `Users`, `Consultations`, `Prescriptions`, `FollowUps`, `Payments`, `BeforeAfterCases`, `AuditLog`.
4. Share the spreadsheet and Drive folders with the service account email.
5. In `backend/.env`, set:
   - `USE_MOCK_DATA=false`
   - `GOOGLE_APPLICATION_CREDENTIALS=./secrets/service-account.json`
   - `SHEET_ID=<your-sheet-id>`
   - `DRIVE_FOLDER_*=<folder-ids>`
6. **Never commit** the service-account JSON or your `.env` file.

---

## Security Notes

- All Google credentials are stored in **environment variables only** — never in source code.
- Sessions are HTTP-only, SameSite=strict, 8-hour expiry.
- Rate limiting on auth endpoints (20 req/15 min).
- Patients can only access their own records (enforced server-side).
- Doctor-only consultation notes are stripped from patient API responses.
- All state-changing API calls are audit-logged.
- `helmet` security headers applied on all API responses.

---

## Google Sheets Schema

| Sheet           | Columns                                                                        |
|-----------------|--------------------------------------------------------------------------------|
| Users           | id, name, email, passwordHash, role, patientId, phone                         |
| Patients        | patientId, name, dob, gender, phone, email, address, bloodGroup, allergies, registeredOn, userId |
| Appointments    | appointmentId, patientId, patientName, date, time, type, status, notes, fee, feePaid |
| Consultations   | consultationId, patientId, appointmentId, date, chiefComplaint, diagnosis, prescription, advice, followUpDate, doctorNotes, createdBy |
| Payments        | paymentId, appointmentId, patientId, amount, mode, date, status               |
| AuditLog        | id, timestamp, userId, userRole, action, resource, resourceId, detail, ip     |
