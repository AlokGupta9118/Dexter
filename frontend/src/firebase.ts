import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredConfig = [
  ["VITE_FIREBASE_API_KEY", config.apiKey],
  ["VITE_FIREBASE_AUTH_DOMAIN", config.authDomain],
  ["VITE_FIREBASE_PROJECT_ID", config.projectId],
  ["VITE_FIREBASE_APP_ID", config.appId],
] as const;

export const missingFirebaseConfig = requiredConfig.filter(([, value]) => !value?.trim()).map(([key]) => key);
export const firebaseConfigured = missingFirebaseConfig.length === 0;

if (!firebaseConfigured) console.error("Firebase configuration is incomplete:", missingFirebaseConfig);

const app = firebaseConfigured ? (getApps().length > 0 ? getApp() : initializeApp(config)) : null;
export const auth = app ? getAuth(app) : null;
export default app;
