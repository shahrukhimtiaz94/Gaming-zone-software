// Vercel/server only. Never import this module in browser code.
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';

export function getFirebaseAdminApp() {
  const existing = getApps().find(app => app.name === 'nexus-server');
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID || 'gaming-zone-software';
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    if (process.env.VERCEL || !projectId.startsWith('demo-') || !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST)) throw new Error('Emulator requires a local demo project, never Vercel/production.');
    return initializeApp({ projectId }, 'nexus-server');
  }
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  let credential;
  if (clientEmail && privateKey) {
    credential = cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') });
  } else if (!clientEmail && !privateKey && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = applicationDefault();
  } else {
    throw new Error('Firebase server credentials missing. Configure FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY securely in Vercel, or use an existing GOOGLE_APPLICATION_CREDENTIALS binding.');
  }
  return initializeApp({ projectId, credential, ...(process.env.FIREBASE_DATABASE_URL ? { databaseURL: process.env.FIREBASE_DATABASE_URL } : {}) }, 'nexus-server');
}
