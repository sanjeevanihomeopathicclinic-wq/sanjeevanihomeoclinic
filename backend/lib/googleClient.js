/**
 * Google Sheets + Drive client initialisation.
 * Credentials come ONLY from environment variables / service-account file.
 * Nothing secret is ever written to source code.
 */

const { google } = require('googleapis');

let _auth = null;

function getAuth() {
  if (_auth) return _auth;

  // Option A: explicit inline env vars (hosting platforms)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    _auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });
    return _auth;
  }

  // Option B: service-account JSON file (local dev)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    _auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive',
      ],
    });
    return _auth;
  }

  throw new Error(
    'Google credentials not configured. ' +
    'Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY in environment.'
  );
}

async function getSheetsClient() {
  const auth = getAuth();
  return google.sheets({ version: 'v4', auth });
}

async function getDriveClient() {
  const auth = getAuth();
  return google.drive({ version: 'v3', auth });
}

module.exports = { getSheetsClient, getDriveClient };
