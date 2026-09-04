import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// Firebase web config is not a secret -- it's meant to ship in the client bundle;
// real security comes from Firebase Auth + Firestore Security Rules, not from hiding
// this.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyCpdWjEDfTWY7QmVDAZcRivnLZK-nvjkww",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "battle-arena-production.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "battle-arena-production",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:363123787810:web:331476ef63497d44c0227b",
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);
export const db = getFirestore(app);

// VITE_USE_EMULATOR=true points the client at a local `firebase emulators:start`
// instead of the real project -- set this in client/.env.local for dev.
if (import.meta.env.VITE_USE_EMULATOR === "true") {
  connectAuthEmulator(firebaseAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
