import { initializeApp, getApps, getApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase Web API keys are publishable; keeping non-secret values inline is
// safe. Override any of them with VITE_FIREBASE_* env vars when needed.
const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyCASsJmuGAZ-cB-Nqot_XexbIF4LLlYZZY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "study-flow-a0b26.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "study-flow-a0b26",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "study-flow-a0b26.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "808220543566",
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ?? "1:808220543566:web:4c5fc7268f7a1267ff911f",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "G-9ME0Y3GXSY",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
