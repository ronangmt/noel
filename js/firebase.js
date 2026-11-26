import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

export const isConfigured = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('REMPLACE');

// Deux "apps" séparées : la session participant (anonyme) et la session admin (email)
// ne s'écrasent pas, même dans le même navigateur.
export function initFirebase(name) {
  const app = name ? initializeApp(firebaseConfig, name) : initializeApp(firebaseConfig);
  return { app, auth: getAuth(app), db: getFirestore(app) };
}
