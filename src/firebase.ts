import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// 1. Cargamos la configuración desde las variables de entorno (.env.local)
// TypeScript no se quejará gracias al archivo vite-env.d.ts
const firebaseConfig = {
  apiKey: import.meta.env.VITE_API_KEY,
  authDomain: import.meta.env.VITE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_APP_ID
};

// 2. Validación estricta: verifica que todas las variables estén definidas
// Esto previene errores en runtime y asegura que las credenciales no se suban a GitHub
const requiredKeys = [
  'VITE_API_KEY',
  'VITE_AUTH_DOMAIN',
  'VITE_PROJECT_ID',
  'VITE_STORAGE_BUCKET',
  'VITE_MESSAGING_SENDER_ID',
  'VITE_APP_ID'
] as const;

const missingKeys = requiredKeys.filter(
  key => !import.meta.env[key] || import.meta.env[key] === 'undefined'
);

if (missingKeys.length > 0) {
  const errorMessage = `
╔══════════════════════════════════════════════════════════════╗
║  ERROR: Variables de entorno Firebase no configuradas       ║
╠══════════════════════════════════════════════════════════════╣
║  Faltan las siguientes variables:                            ║
║  ${missingKeys.map(k => `  • ${k}`).join('\n║  ')}              ║
╠══════════════════════════════════════════════════════════════╣
║  SOLUCIÓN:                                                   ║
║  1. Crea un archivo .env.local en la raíz del proyecto      ║
║  2. Copia .env.example y completa con tus credenciales       ║
║  3. Reinicia el servidor de desarrollo                      ║
╚══════════════════════════════════════════════════════════════╝
  `;
  
  console.error(errorMessage);
  
  // En desarrollo, lanzamos error para detener la ejecución
  if (import.meta.env.DEV) {
    throw new Error(`Variables de entorno faltantes: ${missingKeys.join(', ')}`);
  }
}

// 3. Inicializamos Firebase solo si todas las variables están presentes
const app = initializeApp(firebaseConfig);

// 4. Exportamos los servicios listos para usar en toda la app
export const auth = getAuth(app);
export const db = getFirestore(app);