// Client Component — reads auth state from context and uses router hooks.
"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Wraps every page and enforces the rule: you must be logged in to see anything
// except the login page itself.
//
// Rendering logic:
//   loading == true       → show "Checking..." to prevent the login-page flash
//   no user + not /login  → redirect to /login (the useEffect handles this)
//   user exists           → render children normally
//   on /login             → render children (the login page itself is always visible)
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only redirect after Firebase has finished its initial auth check.
    // If we redirected during loading, logged-in users would briefly see
    // the login page every time the app starts.
    if (!loading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [user, loading, pathname, router]);

  // ── While Firebase is checking auth status ────────────────────────────────
  // This typically resolves in under a second, but we still need to handle it.
  // Without this, the app would render the page (or redirect) before Firebase
  // confirms whether the user is actually logged in.
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <p className="text-sm text-stone-500">Loading...</p>
      </div>
    );
  }

  // ── Logged out, not on the login page ─────────────────────────────────────
  // The redirect is already queued in useEffect above.
  // Return null here so we don't flash the protected page content while
  // the navigation is in progress.
  if (!user && pathname !== "/login") {
    return null;
  }

  // ── Logged in (or we're on the login page) ────────────────────────────────
  return children;
}
