import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
const config = { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID };
export const firebaseConfigured = !!(config.apiKey && config.authDomain && config.projectId && config.appId);
export function firebaseAuth() {
  if (!firebaseConfigured) throw Error('Firebase web configuration is not enabled on this deployment.');
  const app = getApps().find(a => a.name === 'specflow-web') || initializeApp(config, 'specflow-web');
  return getAuth(app);
}
