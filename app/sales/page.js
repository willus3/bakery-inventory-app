// Client Component — required because useState, useEffect, and hooks are used.
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { getFinishedGoods, getSalesRecords, addSaleRecord } from "@/lib/firestore";

// ─────────────────────────────────────────────────────────────────────────────
// Sales page
// ─────────────────────────────────────────────────────────────────────────────
// Two sections:
//   1. Record a Sale form — select a finished good, enter qty + price,
//      see live stock-remaining and revenue previews, block if oversold.
//   2. Sales History table — filterable by finished good, with a summary
//      row at the bottom showing totals for the currently visible records.
// ─────────────────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const { user } = useAuth();

  // ── Server data ────────────────────────────────────────────────────────────
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [salesRecords,  setSalesRecords]  = useState([]);
  const [loading,       setLoading]       = useState(true);

  // ── Form state ─────────────────────────────────────────────────────────────
  // Single object for all form fields — same pattern as every other page.
  const [formData,    setFormData]    = useState({
    finishedGoodId: "",
    quantitySold:   "",
    pricePerUnit:   "",
    notes:          "",
  });
  const [submitting, setSubmitting] = useState(false);

  // ── Filter state ───────────────────────────────────────────────────────────
  // Which finished good the history table is filtered to ("" = show all).
  const [filterGoodId, setFilterGoodId] = useState("");

  // ── Load data on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    loadData();
  }, []);

  // Fetches finished goods (for dropdowns) and sales records (for history)
  // in parallel. Called on mount and after each successful sale submission.
  const loadData = async () => {
    setLoading(true);
    try {
      const [goods, records] = await Promise.all([
        getFinishedGoods(),
        getSalesRecords(),
      ]);
      setFinishedGoods(goods);
      setSalesRecords(records);
    } catch (err) {
      console.error("Failed to load sales data:", err);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived: form calculations ─────────────────────────────────────────────
  // These are plain variables computed on every render — not state.
  // They react to changes in formData automatically.

  // The full object for the finished good currently selected in the form.
  const selectedGood = finishedGoods.find((g) => g.id === formData.finishedGoodId);

  const qty   = parseFloat(formData.quantitySold) || 0;
  const price = parseFloat(formData.pricePerUnit) || 0;

  // How much stock would remain after recording this sale.
  const remainingAfterSale = (selectedGood?.currentStock ?? 0) - qty;

  // True when qty > available stock — we block the submit button in this case.
  const isOversold = qty > 0 && remainingAfterSale < 0;

  // Live revenue preview shown next to the price field.
  const revenuePreview = qty * price;

  // ── Derived: history filter + summary ─────────────────────────────────────
  // Filter the history table to the selected finished good, or show all.
  const filteredSales = filterGoodId
    ? salesRecords.filter((r) => r.finishedGoodId === filterGoodId)
    : salesRecords;

  // Summary row values — computed from filteredSales so they update automatically
  // when the filter changes, without any extra state or useEffect.
  //
  // .reduce() walks every record in filteredSales and accumulates a running total.
  // Starting value is 0. Each iteration adds the record's field to the sum.
  const summaryUnitsSold = filteredSales.reduce((sum, r) => sum + r.quantitySold, 0);
  const summaryRevenue   = filteredSales.reduce((sum, r) => sum + r.totalRevenue, 0);

  // ── Handlers ───────────────────────────────────────────────────────────────

  // When the user picks a finished good from the dropdown, auto-fill the price
  // field with the good's stored price (if one exists). The baker can always
  // override it before submitting.
  const handleGoodSelect = (goodId) => {
    const good = finishedGoods.find((g) => g.id === goodId);
    setFormData((prev) => ({
      ...prev,
      finishedGoodId: goodId,
      // Only overwrite pricePerUnit if the good has a stored price.
      // If not, leave whatever the user already typed.
      pricePerUnit: good?.price != null ? String(good.price) : prev.pricePerUnit,
    }));
  };

  // Generic handler for the other form fields (quantity, price, notes).
  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Submits the sale form: validates, writes to Firestore, resets, refreshes.
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.finishedGoodId || !formData.quantitySold || isOversold) return;

    setSubmitting(true);
    try {
      await addSaleRecord({
        finishedGoodId:   formData.finishedGoodId,
        finishedGoodName: selectedGood.name,
        quantitySold:     qty,
        pricePerUnit:     price,
        totalRevenue:     revenuePreview,
        notes:            formData.notes.trim(),
        soldBy:           user?.email ?? "",
      });

      // Keep the finished good selected so the baker can quickly log
      // another sale of the same item. Clear qty and notes.
      setFormData((prev) => ({
        ...prev,
        quantitySold: "",
        notes: "",
      }));

      // Re-fetch so current stock and history are both up to date.
      await loadData();
    } catch (err) {
      console.error("Failed to record sale:", err);
      window.alert("Failed to record sale. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Converts a Firestore Timestamp (or plain Date) to a short readable string.
  const formatDate = (ts) => {
    if (!ts) return "—";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day:   "numeric",
      year:  "numeric",
    });
  };

  // Formats a number as US dollars with two decimal places.
  const formatCurrency = (n) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-stone-500 text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-10">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">Sales</h1>
        <p className="text-sm text-stone-500 mt-1">
          Record a sale and automatically deduct from finished good stock.
        </p>
      </div>

      {/* ── Sale recording form ───────────────────────────────────────────── */}
      <section>
        <h2 className="text-base font-medium text-stone-700 mb-4">Record a Sale</h2>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Finished good selector */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Finished Good
            </label>
            <select
              value={formData.finishedGoodId}
              onChange={(e) => handleGoodSelect(e.target.value)}
              required
              className="w-full sm:w-72 rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">Select a finished good…</option>
              {finishedGoods.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            {/* Show current stock once a good is selected */}
            {selectedGood && (
              <p className="text-xs text-stone-500 mt-1.5">
                Current stock:{" "}
                <span className="font-medium text-stone-700">
                  {selectedGood.currentStock} {selectedGood.unit}
                </span>
              </p>
            )}
          </div>

          {/* Quantity + stock-remaining preview */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Quantity Sold
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="number"
                min="0.01"
                step="any"
                value={formData.quantitySold}
                onChange={(e) => handleFieldChange("quantitySold", e.target.value)}
                required
                placeholder="0"
                className="w-32 rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />

              {/* Live feedback — shows remaining stock or a shortage warning */}
              {selectedGood && qty > 0 && (
                <span
                  className={`text-xs font-medium ${
                    isOversold ? "text-rose-600" : "text-stone-500"
                  }`}
                >
                  {isOversold
                    ? `⚠ ${Math.abs(remainingAfterSale).toFixed(2)} ${selectedGood.unit} short`
                    : `${remainingAfterSale.toFixed(2)} ${selectedGood.unit} remaining after sale`}
                </span>
              )}
            </div>
          </div>

          {/* Price per unit + revenue preview */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Price per Unit ($)
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.pricePerUnit}
                onChange={(e) => handleFieldChange("pricePerUnit", e.target.value)}
                required
                placeholder="0.00"
                className="w-32 rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />

              {/* Live revenue preview */}
              {qty > 0 && price > 0 && (
                <span className="text-xs text-stone-500">
                  Total:{" "}
                  <span className="font-medium text-stone-700">
                    {formatCurrency(revenuePreview)}
                  </span>
                </span>
              )}
            </div>
            {/* Hint when price was auto-filled from the stored good price */}
            {selectedGood?.price != null && formData.pricePerUnit === String(selectedGood.price) && (
              <p className="text-xs text-stone-400 mt-1">
                Price pre-filled from stored good — edit if needed.
              </p>
            )}
          </div>

          {/* Optional notes */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Notes{" "}
              <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.notes}
              onChange={(e) => handleFieldChange("notes", e.target.value)}
              placeholder="e.g. Farmers market booth 3"
              className="w-full sm:w-96 rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Submit + oversold error */}
          <div className="space-y-2">
            <button
              type="submit"
              disabled={
                submitting ||
                isOversold ||
                !formData.finishedGoodId ||
                !formData.quantitySold
              }
              className="px-4 py-2 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Recording…" : "Record Sale"}
            </button>

            {isOversold && (
              <p className="text-xs text-rose-600">
                Quantity exceeds available stock. Reduce the quantity before recording.
              </p>
            )}
          </div>

        </form>
      </section>

      {/* ── Sales history ─────────────────────────────────────────────────── */}
      <section>

        {/* Section header + filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-medium text-stone-700">Sales History</h2>

          {/* Filter by finished good — affects both the table rows and the summary row */}
          <select
            value={filterGoodId}
            onChange={(e) => setFilterGoodId(e.target.value)}
            className="w-full sm:w-56 rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">All finished goods</option>
            {finishedGoods.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {filteredSales.length === 0 ? (
          <p className="text-sm text-stone-400">No sales recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="min-w-full text-sm">

              <thead className="bg-stone-50 text-stone-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Finished Good</th>
                  <th className="px-4 py-3 text-right font-medium">Qty Sold</th>
                  <th className="px-4 py-3 text-right font-medium">Price / Unit</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  <th className="px-4 py-3 text-left font-medium">Sold By</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100 bg-white">
                {filteredSales.map((record) => (
                  <tr key={record.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
                      {formatDate(record.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-stone-800 font-medium">
                      {record.finishedGoodName}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-600">
                      {record.quantitySold}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-600">
                      {formatCurrency(record.pricePerUnit)}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-800 font-medium">
                      {formatCurrency(record.totalRevenue)}
                    </td>
                    <td className="px-4 py-3 text-stone-500 text-xs">
                      {record.soldBy || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* ── Summary row ──────────────────────────────────────────────
                  Derived from filteredSales — updates automatically when the
                  filter dropdown changes. No extra state needed. */}
              <tfoot>
                <tr className="bg-stone-50 border-t-2 border-stone-200">
                  <td
                    colSpan={2}
                    className="px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide"
                  >
                    {filterGoodId ? "Filtered Total" : "Grand Total"}
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-stone-700">
                    {summaryUnitsSold % 1 === 0
                      ? summaryUnitsSold
                      : summaryUnitsSold.toFixed(2)}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right text-sm font-semibold text-stone-700">
                    {formatCurrency(summaryRevenue)}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>

            </table>
          </div>
        )}

      </section>

    </main>
  );
}
