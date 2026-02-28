// Client Component — this page uses state, form handling, and Firebase auth.
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

// Maps Firebase's technical error codes to plain English messages.
// Firebase errors look like: { code: "auth/wrong-password", message: "..." }
// The `.code` values are documented but not human-friendly, so we translate them.
const getFriendlyError = (code) => {
  switch (code) {
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/user-not-found":
      return "No account found with that email.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account with that email already exists.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many failed attempts. Try again in a few minutes.";
    default:
      return "Something went wrong. Please try again.";
  }
};

// The login page. Handles both sign-in and account creation with a single toggle.
// On first run, use "Create account" to register your email and password.
// After that, "Sign in" is all you'll need.
export default function LoginPage() {
  const router = useRouter();

  // Toggle between "sign in" and "create account" modes.
  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError]         = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Handles changes for both the email and password inputs.
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Submits the form — either signs in or creates an account depending on mode.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (isCreating) {
        // createUserWithEmailAndPassword registers a new account in Firebase Auth.
        // You'll only need this once to set up your account.
        await createUserWithEmailAndPassword(auth, formData.email, formData.password);
      } else {
        // signInWithEmailAndPassword checks the credentials against Firebase Auth
        // and, if they match, sets a session cookie in the browser.
        // onAuthStateChanged in AuthContext will fire immediately after, setting
        // the user in context and unblocking all protected routes.
        await signInWithEmailAndPassword(auth, formData.email, formData.password);
      }

      // On success, send the user to the dashboard.
      router.replace("/");

    } catch (err) {
      // err.code is the Firebase error code (e.g. "auth/wrong-password").
      // We pass it to getFriendlyError to get a human-readable message.
      setError(getFriendlyError(err.code));

    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* ── Header ── */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-stone-800">Bakery MRP</h1>
          <p className="mt-1 text-sm text-stone-500">
            {isCreating ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        {/* ── Form card ── */}
        <div className="rounded-lg border border-stone-200 bg-white p-6 space-y-4">

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                required
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete={isCreating ? "new-password" : "current-password"}
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            {/* Error message */}
            {error && (
              <p className="text-sm text-rose-600">{error}</p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting
                ? (isCreating ? "Creating account..." : "Signing in...")
                : (isCreating ? "Create account" : "Sign in")}
            </button>

          </form>

          {/* ── Toggle between sign in / create account ── */}
          <div className="border-t border-stone-100 pt-4 text-center">
            <p className="text-sm text-stone-500">
              {isCreating ? "Already have an account?" : "First time? Need to create an account?"}
              {" "}
              <button
                onClick={() => { setIsCreating((prev) => !prev); setError(null); }}
                className="font-medium text-amber-700 hover:text-amber-900"
              >
                {isCreating ? "Sign in" : "Create account"}
              </button>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
