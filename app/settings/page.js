// Client Component — uses hooks for form state, auth check, and settings context.
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";

// ─── Settings Page ────────────────────────────────────────────────────────────
// Lets the bakery owner configure app-wide defaults: bakery name,
// scheduled work order times, and which email addresses have admin access.
//
// Access control:
//   - If adminEmails is empty (first-time setup), anyone logged in can edit.
//   - Once adminEmails has entries, only those emails can access the page.
//   - This prevents accidental lock-out while still protecting the settings.
export default function SettingsPage() {
  const { user }                              = useAuth();
  const { settings, loadingSettings, updateSettings } = useSettings();

  // ── Local form state ─────────────────────────────────────────────────────
  // We keep a local copy so edits don't affect the rest of the app until saved.
  const [formData, setFormData] = useState({
    bakeryName:       "",
    defaultStartTime: "",
    defaultDueTime:   "",
    adminEmails:      "",   // stored as array, edited as newline-separated text
  });

  const [saving,   setSaving]   = useState(false);
  const [saveMsg,  setSaveMsg]  = useState("");   // "" | "saved" | "error"

  // ── Pre-fill the form once real settings have loaded ─────────────────────
  // We wait for loadingSettings to be false before populating — this way the
  // inputs never flash the defaults and then jump to the real values.
  useEffect(() => {
    if (!loadingSettings) {
      setFormData({
        bakeryName:       settings.bakeryName,
        defaultStartTime: settings.defaultStartTime,
        defaultDueTime:   settings.defaultDueTime,
        // Convert the stored array back into a newline-separated string for the textarea.
        adminEmails:      (settings.adminEmails ?? []).join("\n"),
      });
    }
  }, [loadingSettings]); // Re-runs only when the load completes (once).

  // ── Access control ───────────────────────────────────────────────────────
  // Show a loading skeleton while settings are being fetched.
  if (loadingSettings) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading settings...</p>
      </div>
    );
  }

  // Once loaded, check if this user is allowed.
  // An empty adminEmails list means "no restriction yet" — allow anyone.
  const adminList = settings.adminEmails ?? [];
  const isAdmin   = adminList.length === 0 || adminList.includes(user?.email);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-semibold text-stone-800 mb-2">Settings</h1>
        <p className="text-sm text-stone-500">
          You don't have permission to edit settings. Contact your bakery admin.
        </p>
      </div>
    );
  }

  // ── Change handler ───────────────────────────────────────────────────────
  // One handler for all inputs — reads the input name from the event.
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setSaveMsg("");  // Clear any previous save confirmation on new change.
  };

  // ── Save handler ─────────────────────────────────────────────────────────
  // Converts the adminEmails textarea back into an array, then calls
  // updateSettings() which writes to Firestore and updates context state.
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg("");
    try {
      await updateSettings({
        bakeryName:       formData.bakeryName.trim(),
        defaultStartTime: formData.defaultStartTime,
        defaultDueTime:   formData.defaultDueTime,
        // Split on newlines, trim each line, remove blanks.
        adminEmails: formData.adminEmails
          .split("\n")
          .map((email) => email.trim())
          .filter(Boolean),
      });
      setSaveMsg("saved");
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveMsg("error");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-800">Settings</h1>
        <p className="text-sm text-stone-500 mt-1">
          App-wide configuration for your bakery
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-8">

        {/* ── Section: General ─────────────────────────────────────────── */}
        <section className="rounded-lg border border-stone-200 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
            General
          </h2>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Bakery name
            </label>
            <input
              type="text"
              name="bakeryName"
              value={formData.bakeryName}
              onChange={handleChange}
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="e.g. Main Street Bakery"
            />
            <p className="text-xs text-stone-400 mt-1">
              Shown as the dashboard heading
            </p>
          </div>
        </section>

        {/* ── Section: Work order defaults ─────────────────────────────── */}
        <section className="rounded-lg border border-stone-200 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
            Work order defaults
          </h2>
          <p className="text-xs text-stone-400 -mt-2">
            Applied when work orders are generated from the weekly plan
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Default start time
              </label>
              <input
                type="time"
                name="defaultStartTime"
                value={formData.defaultStartTime}
                onChange={handleChange}
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Default due time
              </label>
              <input
                type="time"
                name="defaultDueTime"
                value={formData.defaultDueTime}
                onChange={handleChange}
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>
        </section>

        {/* ── Section: Admin access ─────────────────────────────────────── */}
        <section className="rounded-lg border border-stone-200 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider">
            Admin access
          </h2>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Admin email addresses
            </label>
            <textarea
              name="adminEmails"
              value={formData.adminEmails}
              onChange={handleChange}
              rows={4}
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
              placeholder={"owner@example.com\nmanager@example.com"}
            />
            <p className="text-xs text-stone-400 mt-1">
              One email per line. If blank, any logged-in user can edit settings.
            </p>
          </div>

          {/* Warn if the current user's email won't be in the saved list */}
          {formData.adminEmails.trim() !== "" &&
            !formData.adminEmails
              .split("\n")
              .map((e) => e.trim())
              .includes(user?.email) && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Warning: your own email ({user?.email}) is not in the list — you
              will lose access to this page after saving.
            </p>
          )}
        </section>

        {/* ── Save button + status ─────────────────────────────────────── */}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 rounded-md bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>

          {saveMsg === "saved" && (
            <span className="text-sm text-green-700">Settings saved.</span>
          )}
          {saveMsg === "error" && (
            <span className="text-sm text-rose-600">
              Save failed — check the console for details.
            </span>
          )}
        </div>

      </form>
    </div>
  );
}
