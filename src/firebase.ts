import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Gracias al archivo vite-env.d.ts, TypeScript ahora sabe que estas variables existen
const firebaseConfig = {
  apiKey: "AIzaSyB_nKKCZxp9dkg4CFV7N6ySavuQ2BH7syk",
  authDomain: "appclases-40e85.firebaseapp.com",
  projectId: "appclases-40e85",
  storageBucket: "appclases-40e85.firebasestorage.app",
  messagingSenderId: "846276201926",
  appId: "1:846276201926:web:f3573360f1c67c4112f6c7"
};

// Validación temprana para evitar claves inválidas/sin definir
const missing = Object.entries(firebaseConfig)
  .filter(([, value]) => !value || value === 'undefined')
  .map(([key]) => key);

if (missing.length) {
  const message = `Faltan variables de entorno Firebase: ${missing.join(', ')}. Define VITE_* en .env.local`;
  console.error(message);
  throw new Error(message);
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);