// Client Component — this file uses hooks and browser-side Firebase APIs.
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

// ─── 1. Create the context "channel" ─────────────────────────────────────────
// createContext() creates an empty channel. We set the default to null,
// which is what any component would see if it called useAuth() outside of
// an AuthProvider (a sign that something is wired up wrong).
const AuthContext = createContext(null);

// ─── 2. The provider component ───────────────────────────────────────────────
// AuthProvider is the component we'll wrap around the whole app in layout.js.
// It holds the auth state and "broadcasts" it on the channel so any component
// below it in the tree can read it.
export function AuthProvider({ children }) {

  // `user` is the Firebase User object when logged in, or null when logged out.
  const [user, setUser] = useState(null);

  // `loading` is true while Firebase is doing its initial auth check on startup.
  // Without this, the app would flash the login page for a split second even
  // when the user is already logged in — Firebase just hasn't confirmed it yet.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // onAuthStateChanged registers a listener with Firebase.
    // Firebase calls the callback immediately with the current user (or null),
    // and again any time the user signs in or out.
    // This is how we stay in sync with the auth state without polling Firebase.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    // Return the unsubscribe function so React can clean up the listener
    // when AuthProvider is removed from the tree. Without this, the listener
    // would keep running in the background and cause a memory leak.
    return unsubscribe;
  }, []); // Empty array = run once on mount, clean up on unmount.

  // Wraps Firebase's signOut so consumers don't need to import `auth` directly.
  const signOut = () => firebaseSignOut(auth);

  // The value object is what gets broadcast on the channel.
  // Every component that calls useAuth() receives this exact object.
  const value = { user, loading, signOut };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── 3. The custom hook ───────────────────────────────────────────────────────
// This is just a convenience wrapper. Instead of writing:
//   import { useContext } from "react";
//   import { AuthContext } from "@/context/AuthContext";
//   const { user } = useContext(AuthContext);
// ...any component can just do:
//   import { useAuth } from "@/context/AuthContext";
//   const { user } = useAuth();
export const useAuth = () => useContext(AuthContext);
