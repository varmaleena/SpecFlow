import { firestore } from './firebase-admin';
import { FirebaseStore } from './firebase-store';
export const APP_ORIGIN = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
export const env = {
  get DB() { const db = firestore(); return db ? new FirebaseStore(db) : undefined; },
  get GEMINI_API_KEY() { return process.env.GEMINI_API_KEY; },
  get GROQ_API_KEY() { return process.env.GROQ_API_KEY; },
  get FLOW_TOKEN_ENCRYPTION_KEY() { return process.env.FLOW_TOKEN_ENCRYPTION_KEY; },
};
