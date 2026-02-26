// Client Component — required because we use React hooks (useState, useEffect).
"use client";

import { useState, useEffect } from "react";
import { getFinishedGoods } from "@/lib/firestore";
import { getEndOfDayRecords, addEndOfDayRecords } from "@/lib/firestore";
import { useAuth } from "@/context/AuthContext";

// Returns today's date as a "YYYY-MM-DD" string (local time, not UTC).
const getTodayString = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Formats a "YYYY-MM-DD" string into a readable label like "March 1, 2026".
// Appending T12:00:00 prevents the date from rolling back a day due to
// timezone offsets when constructing a Date from a bare YYYY-MM-DD string.
const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
};

export default function EndOfDayPage() {
  const { user } = useAuth();

  // ─── Section 1: Reconciliation form ──────────────────────────────────────
  // Each entry in `rows` represents one fresh finished good to reconcile.
  const [rows,          setRows]          = useState([]);
  const [loaded,        setLoaded]        = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [loadError,     setLoadError]     = useState(null);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitError,   setSubmitError]   = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // ─── Section 2: History ───────────────────────────────────────────────────
  const [history,        setHistory]        = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Load history once on mount so past records are always visible.
  useEffect(() => {
    const fetchHistory = async () => {
      const data = await getEndOfDayRecords();
      setHistory(data);
      setHistoryLoading(false);
    };
    fetchHistory();
  }, []);

  // ─── Load today's inventory ───────────────────────────────────────────────
  // Fetches all finished goods, identifies which are "day-old" products
  // (referenced by another good's dayOldFinishedGoodId), then builds one
  // editable row per fresh good that still has stock remaining.
  const handleLoad = async () => {
    setLoading(true);
    setLoadError(null);
    setSubmitSuccess(false);

    try {
      const allGoods = await getFinishedGoods();

      // Build a Set of IDs that ARE someone else's day-old product.
      // We exclude these from the reconciliation — only fresh products
      // need to be zeroed out at end of day.
      const dayOldIds = new Set(
        allGoods
          .filter((fg) => fg.dayOldFinishedGoodId)
          .map((fg) => fg.dayOldFinishedGoodId)
      );

      const freshWithStock = allGoods.filter(
        (fg) => fg.currentStock > 0 && !dayOldIds.has(fg.id)
      );

      if (freshWithStock.length === 0) {
        setLoadError("No fresh finished goods with remaining stock. Nothing to reconcile.");
        setLoading(false);
        return;
      }

      // Build one row per product. If a day-old link exists, default the
      // action to "transferToDayOld"; otherwise only "writeOff" is available.
      const initialRows = freshWithStock.map((fg) => ({
        finishedGoodId:         fg.id,
        finishedGoodName:       fg.name,
        currentStock:           fg.currentStock,
        unit:                   fg.unit,
        dayOldFinishedGoodId:   fg.dayOldFinishedGoodId   || "",
        dayOldFinishedGoodName: fg.dayOldFinishedGoodName || "",
        action:   fg.dayOldFinishedGoodId ? "transferToDayOld" : "writeOff",
        // Default the quantity to the full remaining stock.
        // The owner reduces this if some units sold late in the day.
        quantity: String(fg.currentStock),
        notes:    "",
      }));

      setRows(initialRows);
      setLoaded(true);

    } catch (err) {
      console.error("Failed to load inventory:", err);
      setLoadError("Failed to load inventory. Please try again.");

    } finally {
      setLoading(false);
    }
  };

  // Updates a single field on the row at `index`.
  const handleRowChange = (index, field, value) => {
    setRows((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Validates all rows then submits them as one atomic batch write.
  const handleSubmit = async () => {
    setSubmitError(null);

    // Validate every row before touching Firestore.
    for (const row of rows) {
      const qty = parseFloat(row.quantity);
      if (!qty || qty <= 0) {
        setSubmitError(
          `Quantity for "${row.finishedGoodName}" must be greater than 0.`
        );
        return;
      }
      if (qty > row.currentStock) {
        setSubmitError(
          `Quantity for "${row.finishedGoodName}" cannot exceed current stock ` +
          `(${row.currentStock} ${row.unit}).`
        );
        return;
      }
    }

    setSubmitting(true);

    try {
      const today = getTodayString();

      const records = rows.map((row) => ({
        date:                   today,
        finishedGoodId:         row.finishedGoodId,
        finishedGoodName:       row.finishedGoodName,
        action:                 row.action,
        quantity:               parseFloat(row.quantity),
        // Null out day-old fields on write-off rows so history reads cleanly.
        dayOldFinishedGoodId:   row.action === "transferToDayOld"
                                  ? row.dayOldFinishedGoodId   : null,
        dayOldFinishedGoodName: row.action === "transferToDayOld"
                                  ? row.dayOldFinishedGoodName : null,
        notes: row.notes.trim(),
      }));

      await addEndOfDayRecords(records, user?.email);

      // Refresh history to immediately include the records we just wrote.
      const updatedHistory = await getEndOfDayRecords();
      setHistory(updatedHistory);

      setRows([]);
      setLoaded(false);
      setSubmitSuccess(true);

    } catch (err) {
      console.error("Failed to complete end of day:", err);
      setSubmitError("Failed to save records. Please try again.");

    } finally {
      setSubmitting(false);
    }
  };

  // ─── History grouping ─────────────────────────────────────────────────────
  // Transform the flat records array into [dateString, records[]] pairs
  // sorted newest-first. ISO date strings ("2026-03-01") sort lexicographically
  // so localeCompare gives correct date order without any Date parsing.
  const groupedHistory = Object.entries(
    history.reduce((acc, record) => {
      if (!acc[record.date]) acc[record.date] = [];
      acc[record.date].push(record);
      return acc;
    }, {})
  ).sort(([a], [b]) => b.localeCompare(a));

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-12">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">End of Day</h1>
        <p className="text-sm text-stone-500 mt-1">
          Record unsold fresh inventory. Write off losses or transfer stock to day-old products.
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1 — Today's Reconciliation
      ══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-stone-800">Today's Reconciliation</h2>

        {/* Success banner — shown after a successful submit */}
        {submitSuccess && (
          <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3">
            <p className="text-sm font-medium text-green-800">
              End of day complete. Records saved and stock updated.
            </p>
            <button
              onClick={() => setSubmitSuccess(false)}
              className="mt-1 text-sm text-green-700 underline hover:text-green-900"
            >
              Run another reconciliation
            </button>
          </div>
        )}

        {/* Load button — shown before inventory is loaded */}
        {!loaded && !submitSuccess && (
          <div>
            <button
              onClick={handleLoad}
              disabled={loading}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Loading..." : "Load Today's Inventory"}
            </button>
            {loadError && (
              <p className="mt-2 text-sm text-rose-600">{loadError}</p>
            )}
          </div>
        )}

        {/* Reconciliation table — shown once inventory is loaded */}
        {loaded && rows.length > 0 && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-sm text-left">

                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Product</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">In Stock</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Action</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Quantity</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Notes</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-stone-100 bg-white">
                  {rows.map((row, index) => (
                    <tr key={row.finishedGoodId}>

                      {/* Product name + day-old hint */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-stone-800">{row.finishedGoodName}</div>
                        {row.dayOldFinishedGoodName && (
                          <div className="text-xs text-stone-400 mt-0.5">
                            Day-old: {row.dayOldFinishedGoodName}
                          </div>
                        )}
                      </td>

                      {/* Current stock — read-only reference */}
                      <td className="px-4 py-3 text-stone-600">
                        {row.currentStock} {row.unit}
                      </td>

                      {/* Action dropdown */}
                      <td className="px-4 py-3">
                        <select
                          value={row.action}
                          onChange={(e) => handleRowChange(index, "action", e.target.value)}
                          className="rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        >
                          {/* Transfer option only available when a day-old product is linked */}
                          {row.dayOldFinishedGoodId && (
                            <option value="transferToDayOld">Transfer to Day-Old</option>
                          )}
                          <option value="writeOff">Write Off</option>
                        </select>
                      </td>

                      {/* Quantity — defaults to full stock, owner can reduce */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0"
                            max={row.currentStock}
                            step="any"
                            value={row.quantity}
                            onChange={(e) => handleRowChange(index, "quantity", e.target.value)}
                            className="w-20 rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                          />
                          <span className="text-xs text-stone-400">{row.unit}</span>
                        </div>
                      </td>

                      {/* Notes */}
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={row.notes}
                          onChange={(e) => handleRowChange(index, "notes", e.target.value)}
                          placeholder="Optional"
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                      </td>

                    </tr>
                  ))}
                </tbody>

              </table>
            </div>

            {submitError && (
              <p className="text-sm text-rose-600">{submitError}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Saving..." : "Complete End of Day"}
            </button>
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2 — History
      ══════════════════════════════════════════════════════════════════ */}
      <section className="border-t border-stone-200 pt-8 space-y-6">
        <h2 className="text-lg font-semibold text-stone-800">History</h2>

        {historyLoading ? (
          <p className="text-sm text-stone-500">Loading history...</p>
        ) : groupedHistory.length === 0 ? (
          <p className="text-sm text-stone-500">No end-of-day records yet.</p>
        ) : (
          <div className="space-y-8">
            {groupedHistory.map(([date, dateRecords]) => {

              // Summary totals derived inline — no extra state needed.
              const writtenOff = dateRecords
                .filter((r) => r.action === "writeOff")
                .reduce((sum, r) => sum + r.quantity, 0);
              const transferred = dateRecords
                .filter((r) => r.action === "transferToDayOld")
                .reduce((sum, r) => sum + r.quantity, 0);

              return (
                <div key={date}>

                  {/* Date header + summary chips */}
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-sm font-semibold text-stone-700">
                      {formatDate(date)}
                    </h3>
                    <div className="flex items-center gap-4 text-xs text-stone-500">
                      {writtenOff > 0 && (
                        <span>
                          <span className="text-rose-600 font-medium">{writtenOff}</span> written off
                        </span>
                      )}
                      {transferred > 0 && (
                        <span>
                          <span className="text-amber-700 font-medium">{transferred}</span> transferred
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-stone-200">
                    <table className="w-full text-sm text-left">

                      <thead className="bg-stone-50 border-b border-stone-200">
                        <tr>
                          <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Product</th>
                          <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Action</th>
                          <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Qty</th>
                          <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Day-Old Product</th>
                          <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Notes</th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-stone-100 bg-white">
                        {dateRecords.map((record) => (
                          <tr key={record.id}>
                            <td className="px-4 py-2.5 font-medium text-stone-800">
                              {record.finishedGoodName}
                            </td>
                            <td className="px-4 py-2.5">
                              {record.action === "writeOff" ? (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-rose-100 text-rose-700">
                                  Write Off
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                                  Transfer
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-stone-600">{record.quantity}</td>
                            <td className="px-4 py-2.5 text-stone-500">
                              {record.dayOldFinishedGoodName || "—"}
                            </td>
                            <td className="px-4 py-2.5 text-stone-400">
                              {record.notes || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>

                    </table>
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
