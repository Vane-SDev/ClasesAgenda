import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};

// Validación de seguridad simple
const missingKeys = Object.entries(firebaseConfig)
  .filter((entry) => !entry[1])
  .map((entry) => entry[0]);

if (missingKeys.length > 0) {
  console.error(`Error: Faltan variables en .env.local: ${missingKeys.join(', ')}`);
}

// CORRECCIÓN: Singleton Pattern
// Si ya existe una app (por recarga rápida), úsala. Si no, inicialízala.
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
