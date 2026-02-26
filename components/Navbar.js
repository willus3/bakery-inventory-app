// Client Component — required because usePathname() and useState() are hooks.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/AuthContext";

// The navigation links for the whole app, defined once here.
// Each entry has a label (what the user sees) and an href (the route it links to).
const NAV_LINKS = [
  { label: "Dashboard",      href: "/" },
  { label: "Ingredients",    href: "/ingredients" },
  { label: "Finished Goods", href: "/finished-goods" },
  { label: "Recipes",        href: "/recipes" },
  { label: "Special Orders", href: "/demand" },
  { label: "Work Orders",    href: "/work-orders" },
  { label: "Sales",          href: "/sales" },
  { label: "Restocking",     href: "/restocking" },
];

// Returns true if the given href should be considered "active" for the current path.
// The Dashboard ("/") uses exact match to avoid highlighting on every page.
// All other links use startsWith so nested routes (e.g. /ingredients/edit/123)
// keep the correct link highlighted.
const isActive = (href, pathname) => {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
};

// The top navigation bar, rendered on every page via app/layout.js.
// On desktop: a single horizontal bar with links inline.
// On mobile: a compact bar with a hamburger button that reveals a dropdown.
export default function Navbar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  // Controls whether the mobile menu is open or closed.
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="border-b border-stone-200 bg-white">
      <div className="max-w-4xl mx-auto px-4">

        {/* ── Top bar (always visible) ── */}
        <div className="flex items-center justify-between h-14">

          {/* Brand name */}
          <span className="text-base font-semibold text-stone-800 tracking-tight">
            Bakery Inventory
          </span>

          {/* Desktop links — hidden on mobile, visible on sm+ */}
          <div className="hidden sm:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive(link.href, pathname)
                    ? "bg-amber-50 text-amber-700"
                    : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
                }`}
              >
                {link.label}
              </Link>
            ))}

            {/* Only show the sign-out button when a user is logged in.
                Hidden on the login page where there's no session yet. */}
            {user && (
              <button
                onClick={signOut}
                className="ml-2 px-3 py-1.5 rounded-md text-sm font-medium text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
              >
                Sign out
              </button>
            )}
          </div>

          {/* Hamburger button — visible on mobile only */}
          <button
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label="Toggle menu"
            className="sm:hidden p-2 rounded-md text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
          >
            {/* Show an X when open, three lines when closed */}
            {isOpen ? (
              // X icon
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              // Hamburger icon
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* ── Mobile dropdown ── */}
        {/* Only rendered in the DOM when isOpen is true. */}
        {/* Each link closes the menu on click so it doesn't stay open after navigating. */}
        {isOpen && (
          <div className="sm:hidden border-t border-stone-100 py-2 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive(link.href, pathname)
                    ? "bg-amber-50 text-amber-700"
                    : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
                }`}
              >
                {link.label}
              </Link>
            ))}

            {/* Mobile sign-out button — same conditional as desktop */}
            {user && (
              <button
                onClick={() => { signOut(); setIsOpen(false); }}
                className="block w-full text-left px-3 py-2 rounded-md text-sm font-medium text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
              >
                Sign out
              </button>
            )}
          </div>
        )}

      </div>
    </nav>
  );
}
