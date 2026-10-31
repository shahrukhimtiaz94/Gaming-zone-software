// Public Firebase web configuration, not a server credential.
// The dashboard currently has no browser bundler: do not serve bare npm imports directly.
import { initializeApp, getApps } from 'firebase/app';

export const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyASTqpC-VMcMGFKOgiwn4AYFyh5n-pfBDw',
  authDomain: 'gaming-zone-software.firebaseapp.com',
  projectId: 'gaming-zone-software',
  storageBucket: 'gaming-zone-software.firebasestorage.app',
  messagingSenderId: '463517367909',
  appId: '1:463517367909:web:6f5c1f5a55044d6eea508c',
  measurementId: 'G-4HEBDVZJEK'
});

export function getFirebaseClientApp() {
  return getApps().find(app => app.name === 'nexus-web') || initializeApp(firebaseConfig, 'nexus-web');
}
// Analytics is deliberately not started: it is unrelated to database connectivity.
