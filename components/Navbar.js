// Client Component — uses usePathname(), useState(), and useRef() (all client-side hooks).
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef } from "react";
import { useAuth } from "@/context/AuthContext";

// ─────────────────────────────────────────────────────────────────────────────
// NAV STRUCTURE
// Each group has a label (shown as the dropdown trigger), a unique key
// (used to track which dropdown is open), and an array of page links.
// ─────────────────────────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: "Production",
    key:   "production",
    links: [
      { label: "Weekly Plan",    href: "/weekly-plan" },
      { label: "Work Orders",    href: "/work-orders" },
      { label: "Special Orders", href: "/demand"       },
    ],
  },
  {
    label: "Inventory",
    key:   "inventory",
    links: [
      { label: "Ingredients",    href: "/ingredients"    },
      { label: "Finished Goods", href: "/finished-goods" },
      { label: "Recipes",        href: "/recipes"        },
    ],
  },
  {
    label: "Business",
    key:   "business",
    links: [
      { label: "Sales",      href: "/sales"       },
      { label: "Purchasing", href: "/purchasing"  },
      { label: "End of Day", href: "/end-of-day"  },
    ],
  },
];

// Returns true if the current path lives inside any link in this group.
// Used to highlight the group label when a child page is active.
const isGroupActive = (group, pathname) =>
  group.links.some(link => pathname.startsWith(link.href));

// Returns true if this specific link matches the current path.
// Dashboard uses exact match so it doesn't highlight on every page.
const isLinkActive = (href, pathname) => {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
};

// Small chevron icon used in group triggers and mobile accordion headers.
function ChevronIcon({ open }) {
  return (
    <svg
      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVBAR
// ─────────────────────────────────────────────────────────────────────────────

export default function Navbar() {
  const pathname         = usePathname();
  const { user, signOut } = useAuth();

  // ── Desktop dropdown state ──────────────────────────────────────────────────
  // openGroup tracks which dropdown is currently visible (null = all closed).
  const [openGroup, setOpenGroup] = useState(null);

  // closeTimer is a ref (not state) so updating it never triggers a re-render.
  // It holds the setTimeout ID for the delayed-close safety net.
  const closeTimer = useRef(null);

  // Open a dropdown immediately and cancel any pending close timer.
  const handleGroupEnter = (key) => {
    clearTimeout(closeTimer.current);
    setOpenGroup(key);
  };

  // Start a short close timer. If the mouse enters the panel before it fires,
  // handleGroupEnter cancels the timer and the dropdown stays open.
  // 120 ms is long enough to cross a sub-pixel gap, short enough to feel instant.
  const handleGroupLeave = () => {
    closeTimer.current = setTimeout(() => setOpenGroup(null), 120);
  };

  // ── Mobile menu state ───────────────────────────────────────────────────────
  const [mobileOpen, setMobileOpen]           = useState(false);
  const [openMobileGroup, setOpenMobileGroup] = useState(null);

  // Toggle a group in the mobile accordion.
  const toggleMobileGroup = (key) =>
    setOpenMobileGroup(prev => (prev === key ? null : key));

  return (
    <nav className="border-b border-stone-200 bg-white">
      <div className="max-w-4xl mx-auto px-4">

        {/* ── Top bar (always visible) ─────────────────────────────────────── */}
        <div className="flex items-center justify-between h-14">

          {/* Brand / Dashboard link */}
          <Link
            href="/"
            className={`text-sm font-semibold tracking-tight transition-colors ${
              isLinkActive("/", pathname)
                ? "text-amber-700"
                : "text-stone-800 hover:text-amber-700"
            }`}
          >
            Bakery MRP
          </Link>

          {/* ── Desktop navigation ─────────────────────────────────────────── */}
          {/* Hidden on mobile (sm:flex shows it on small screens and up). */}
          <div className="hidden sm:flex items-center gap-1">

            {NAV_GROUPS.map((group) => (
              // Wrapper div owns the hover events for BOTH the trigger and the panel.
              // onMouseLeave only fires when the cursor exits this outer boundary,
              // so moving from trigger → panel never closes the dropdown.
              <div
                key={group.key}
                className="relative"
                onMouseEnter={() => handleGroupEnter(group.key)}
                onMouseLeave={handleGroupLeave}
              >
                {/* Group trigger button */}
                <button
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isGroupActive(group, pathname)
                      ? "bg-amber-50 text-amber-700"
                      : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
                  }`}
                >
                  {group.label}
                  <ChevronIcon open={openGroup === group.key} />
                </button>

                {/* Dropdown panel — absolute, appears below the trigger */}
                {openGroup === group.key && (
                  // pt-1 creates a 4 px transparent zone above the visible panel.
                  // This bridges the tiny gap between trigger bottom and panel top,
                  // ensuring the cursor never leaves the wrapper mid-travel.
                  <div className="absolute top-full left-0 pt-1 z-50 min-w-[168px]">
                    <div className="rounded-md border border-stone-200 bg-white shadow-lg py-1">
                      {group.links.map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={`block px-4 py-2 text-sm transition-colors ${
                            isLinkActive(link.href, pathname)
                              ? "text-amber-700 bg-amber-50 font-medium"
                              : "text-stone-600 hover:text-stone-900 hover:bg-stone-50"
                          }`}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Sign out button — only shown when a user is logged in */}
            {user && (
              <button
                onClick={signOut}
                className="ml-2 px-3 py-1.5 rounded-md text-sm font-medium text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
              >
                Sign out
              </button>
            )}
          </div>

          {/* ── Hamburger button (mobile only) ─────────────────────────────── */}
          <button
            onClick={() => setMobileOpen(prev => !prev)}
            aria-label="Toggle menu"
            className="sm:hidden p-2 rounded-md text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
          >
            {mobileOpen ? (
              // X icon — shown when menu is open
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              // Hamburger icon — shown when menu is closed
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* ── Mobile menu ──────────────────────────────────────────────────── */}
        {/* Accordion-style: tapping a group header expands its links.         */}
        {/* Only one group can be open at a time (openMobileGroup state).      */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-stone-100 py-2 space-y-0.5">

            {NAV_GROUPS.map((group) => (
              <div key={group.key}>

                {/* Group accordion header */}
                <button
                  onClick={() => toggleMobileGroup(group.key)}
                  className={`flex items-center justify-between w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isGroupActive(group, pathname)
                      ? "text-amber-700 bg-amber-50"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                  }`}
                >
                  {group.label}
                  <ChevronIcon open={openMobileGroup === group.key} />
                </button>

                {/* Expanded links — indented under their group */}
                {openMobileGroup === group.key && (
                  <div className="ml-3 mt-0.5 space-y-0.5">
                    {group.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className={`block px-3 py-2 rounded-md text-sm transition-colors ${
                          isLinkActive(link.href, pathname)
                            ? "text-amber-700 bg-amber-50 font-medium"
                            : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
                        }`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Mobile sign-out — closes the menu after signing out */}
            {user && (
              <button
                onClick={() => { signOut(); setMobileOpen(false); }}
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
