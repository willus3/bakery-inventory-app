// Client Component — uses hooks and calls Firestore on mount.
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getSettings, saveSettings, DEFAULT_SETTINGS } from "@/lib/firestore";

// ─── 1. Create the context "channel" ─────────────────────────────────────────
// We initialise with null so any component that calls useSettings() outside
// of a SettingsProvider gets a clear error rather than a silent wrong value.
const SettingsContext = createContext(null);

// ─── 2. The provider component ───────────────────────────────────────────────
// SettingsProvider fetches the settings document from Firestore once on mount,
// then broadcasts the values to the whole app.
//
// Key design choice: we initialise `settings` with DEFAULT_SETTINGS (not null).
// That means every consumer renders immediately with sensible fallbacks —
// the bakery name on the dashboard shows up on the very first paint, and
// Firestore fills in the real value ~200 ms later with a silent re-render.
// Only the Settings *form* itself needs to wait (see `loadingSettings`).
export function SettingsProvider({ children }) {

  // Initialise with defaults so the UI is never blank while Firestore loads.
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });

  // loadingSettings is true until the first Firestore fetch completes.
  // The Settings page uses this to avoid pre-filling the form with stale defaults.
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    // Fetch once on mount. We don't need a real-time listener here because
    // settings change rarely — a page refresh is acceptable after editing them.
    const fetchSettings = async () => {
      try {
        const data = await getSettings();
        setSettings(data);
      } catch (err) {
        console.error("Failed to load settings:", err);
        // Leave the default values in place — the app still works.
      } finally {
        setLoadingSettings(false);
      }
    };

    fetchSettings();
  }, []);

  // updateSettings merges a partial object into Firestore and into local state
  // so the UI reflects the change immediately without a page reload.
  const updateSettings = async (updates) => {
    await saveSettings(updates);
    setSettings((prev) => ({ ...prev, ...updates }));
  };

  // Everything consumers need: the current values, a loading flag, and a writer.
  const value = { settings, loadingSettings, updateSettings };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

// ─── 3. The custom hook ───────────────────────────────────────────────────────
// Any component can call useSettings() to get the current settings object,
// the loading flag, and the updateSettings function — no prop drilling needed.
export const useSettings = () => useContext(SettingsContext);
