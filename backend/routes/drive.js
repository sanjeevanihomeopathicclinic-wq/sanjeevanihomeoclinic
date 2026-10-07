const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const { logAudit } = require('../lib/audit');

router.use(requireAuth);

// Multer: use memory storage; forward buffer to Google Drive
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP and PDF files are allowed.'));
  },
});

// ── POST /api/drive/upload ────────────────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    const { patientId, folder, description } = req.body;
    if (!patientId) return res.status(400).json({ error: 'Patient ID required.' });

    // Patients can only upload for themselves
    const user = req.session.user;
    if (user.role === 'patient' && user.patientId !== patientId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (process.env.USE_MOCK_DATA === 'true') {
      // Mock: return a fake file reference
      const mockFile = {
        fileId: `mock-file-${Date.now()}`,
        name: req.file.originalname,
        mimeType: req.file.mimetype,
        patientId,
        folder: folder || 'patient-docs',
        description: description || '',
        uploadedBy: user.id,
        uploadedAt: new Date().toISOString(),
        url: null, // No real URL in mock mode
      };
      await logAudit({
        userId: user.id, userRole: user.role,
        action: 'UPLOAD', resource: 'drive', resourceId: mockFile.fileId, ip: req.ip,
      });
      return res.status(201).json({ success: true, file: mockFile });
    }

    // Production: upload to Google Drive
    const { getDriveClient } = require('../lib/googleClient');
    const { Readable } = require('stream');
    const drive = await getDriveClient();

    const folderMap = {
      'patient-docs': process.env.DRIVE_FOLDER_PATIENT_DOCS,
      'patient-images': process.env.DRIVE_FOLDER_PATIENT_IMAGES,
      'prescriptions': process.env.DRIVE_FOLDER_PRESCRIPTIONS,
      'before-after': process.env.DRIVE_FOLDER_BEFORE_AFTER,
      'clinic-docs': process.env.DRIVE_FOLDER_CLINIC_DOCS,
    };
    const folderId = folderMap[folder] || process.env.DRIVE_FOLDER_PATIENT_DOCS;

    const stream = new Readable();
    stream.push(req.file.buffer);
    stream.push(null);

    const driveRes = await drive.files.create({
      requestBody: {
        name: `${patientId}_${Date.now()}_${req.file.originalname}`,
        parents: [folderId],
        description: `Patient: ${patientId} | ${description || ''}`,
      },
      media: { mimeType: req.file.mimetype, body: stream },
      fields: 'id, name, mimeType, webViewLink',
    });

    // Restrict file: NOT publicly accessible
    await drive.permissions.create({
      fileId: driveRes.data.id,
      requestBody: { role: 'reader', type: 'domain' }, // adjust to your org domain or remove for private
    }).catch(() => {}); // Non-fatal

    const fileRef = {
      fileId: driveRes.data.id,
      name: driveRes.data.name,
      mimeType: driveRes.data.mimeType,
      patientId, folder, description: description || '',
      uploadedBy: user.id, uploadedAt: new Date().toISOString(),
    };

    await logAudit({
      userId: user.id, userRole: user.role,
      action: 'UPLOAD', resource: 'drive', resourceId: fileRef.fileId, ip: req.ip,
    });
    res.status(201).json({ success: true, file: fileRef });
  } catch (err) {
    console.error('[DRIVE UPLOAD]', err);
    res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

// ── GET /api/drive/files/:patientId ──────────────────────────────────────────
router.get('/files/:patientId', async (req, res) => {
  try {
    const user = req.session.user;
    if (user.role === 'patient' && user.patientId !== req.params.patientId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (process.env.USE_MOCK_DATA === 'true') {
      return res.json({ files: [] }); // No real files in mock mode
    }

    const { getDriveClient } = require('../lib/googleClient');
    const drive = await getDriveClient();
    const response = await drive.files.list({
      q: `fullText contains '${req.params.patientId}' and trashed = false`,
      fields: 'files(id, name, mimeType, createdTime, description)',
      orderBy: 'createdTime desc',
      pageSize: 50,
    });
    res.json({ files: response.data.files || [] });
  } catch (err) {
    console.error('[DRIVE LIST]', err);
    res.status(500).json({ error: 'Failed to list files.' });
  }
});

module.exports = router;
