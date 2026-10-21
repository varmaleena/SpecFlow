import { normalizePrivateKey } from './credential-format';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
export function adminApp() {
  const existing = getApps().find(app => app.name === 'specflow');
  if (existing) return existing;
  const projectId = process.env.FIREBASE_PROJECT_ID, clientEmail = process.env.FIREBASE_CLIENT_EMAIL, privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  if (!projectId || !clientEmail || !privateKey) return null;
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, 'specflow');
}
export function firestore() { const app = adminApp(); return app ? getFirestore(app) : undefined; }
export async function authenticatedUser(request: Request) {
  const app = adminApp(); if (!app) throw Error('Firebase server configuration is missing.');
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ') || header.length > 12000) throw Error('Sign in to access saved projects.');
  return getAuth(app).verifyIdToken(header.slice(7), true);
}
