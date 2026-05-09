import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';

const config = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Singleton — safe to call on both server and client. */
export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApps()[0] : initializeApp(config);
}

/** Returns true if all Firebase env vars are provided. */
export function isFirebaseConfigured(): boolean {
  return !!(
    config.apiKey && config.authDomain && config.projectId &&
    config.storageBucket && config.messagingSenderId && config.appId
  );
}
