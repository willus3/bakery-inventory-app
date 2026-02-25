// ─── What this file does ────────────────────────────────────────────────────
// This file is the single point of connection between our app and Firebase.
// Think of it like plugging a power cord into the wall — it has to happen once
// before anything else can work. Every other file that needs to read or write
// data will import `db` from here instead of setting up Firebase themselves.
// ────────────────────────────────────────────────────────────────────────────

// ─── 1. Import the tools we need from Firebase ──────────────────────────────
// `initializeApp` sets up the Firebase connection using our config keys.
// `getFirestore` gives us access to the Firestore database once Firebase is running.
// `getAuth` gives us access to the Firebase Authentication service.
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ─── 2. Read our config values from environment variables ───────────────────
// These values come from the .env.local file in the project root.
// The NEXT_PUBLIC_ prefix is required by Next.js to make these values
// available in the browser. Without it, they'd be undefined on the client side.
// We never hardcode these values here — keeping them in .env.local means
// they stay off GitHub and out of version control.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// ─── 3. Initialize the Firebase app ─────────────────────────────────────────
// This is the "turn on the connection" step. We pass in our config object and
// Firebase returns an `app` instance representing our project.
// This should only ever run once — Next.js handles that automatically.
const app = initializeApp(firebaseConfig);

// ─── 4. Get the Firestore database instance ──────────────────────────────────
// `getFirestore` takes the app we just initialized and returns a reference to
// the Firestore database attached to it. We call this `db` as a short, clear
// name that means "the database."
const db = getFirestore(app);

// ─── 5. Get the Firebase Auth instance ───────────────────────────────────────
// `getAuth` returns the authentication service tied to our app. We export it
// as `auth` so the context provider and login page can call sign-in/sign-out
// functions without re-initializing Firebase themselves.
const auth = getAuth(app);

// ─── 6. Export both so other files can use them ──────────────────────────────
// Any file that needs data:   import { db }   from "@/lib/firebase"
// Any file that needs auth:   import { auth } from "@/lib/firebase"
export { db, auth };
