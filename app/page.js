// Client Component — required because we use useState and useEffect.
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getIngredients, getFinishedGoods, getRestockingRecords } from "@/lib/firestore";

// Formats a Firestore Timestamp into a short, readable string.
// Returns "—" if the timestamp hasn't resolved yet.
const formatDate = (timestamp) => {
  if (!timestamp) return "—";
  return timestamp.toDate().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// The main dashboard page.
// Fetches all three collections in parallel and displays:
//   - Summary counts for ingredients and finished goods
//   - Low stock alerts (combined from both collections)
//   - The 5 most recent restocking records
export default function DashboardPage() {

  const [ingredients, setIngredients]     = useState([]);
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [records, setRecords]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);

  // ─── Fetch all data in parallel ──────────────────────────────────────────
  // Promise.all starts all three fetches at the same time instead of
  // waiting for each to finish before starting the next one.
  // If any fetch fails, the catch block sets an error message instead of
  // leaving the page stuck on the loading spinner.
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [ingredientData, finishedGoodData, recordData] = await Promise.all([
          getIngredients(),
          getFinishedGoods(),
          getRestockingRecords(),
        ]);

        setIngredients(ingredientData);
        setFinishedGoods(finishedGoodData);
        setRecords(recordData);

      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        setError("Failed to load data. Please refresh the page.");

      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // ─── Derived data ─────────────────────────────────────────────────────────
  // These are computed from state — not stored separately — so they're always
  // in sync without any extra state management.

  // Combine low-stock items from both collections into one flat list.
  // We tag each item with a display-friendly `itemType` label as we go.
  const lowStockItems = [
    ...ingredients
      .filter((item) => item.currentStock < item.lowStockThreshold)
      .map((item) => ({ ...item, itemType: "Ingredient" })),
    ...finishedGoods
      .filter((item) => item.currentStock < item.lowStockThreshold)
      .map((item) => ({ ...item, itemType: "Finished Good" })),
  ];

  // Take only the 5 most recent records — they're already sorted newest-first
  // by getRestockingRecords(), so a simple slice is all we need.
  const recentRecords = records.slice(0, 5);

  // ─── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  // ─── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-rose-600 text-sm">{error}</p>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">Dashboard</h1>
        <p className="text-sm text-stone-500 mt-1">Overview of your current inventory</p>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 gap-4">

        <Link
          href="/ingredients"
          className="rounded-lg border border-stone-200 bg-white p-5 hover:border-stone-300 hover:bg-stone-50 transition-colors"
        >
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Ingredients</p>
          <p className="mt-1 text-3xl font-semibold text-stone-800">{ingredients.length}</p>
          <p className="mt-1 text-xs text-stone-500">items tracked</p>
        </Link>

        <Link
          href="/finished-goods"
          className="rounded-lg border border-stone-200 bg-white p-5 hover:border-stone-300 hover:bg-stone-50 transition-colors"
        >
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">Finished Goods</p>
          <p className="mt-1 text-3xl font-semibold text-stone-800">{finishedGoods.length}</p>
          <p className="mt-1 text-xs text-stone-500">items tracked</p>
        </Link>

      </div>

      {/* ── Low stock alerts ── */}
      <div>
        <h2 className="text-lg font-semibold text-stone-800 mb-4">Low Stock Alerts</h2>

        {lowStockItems.length === 0 ? (
          // All-clear message when nothing is low
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-medium text-emerald-700">All stock levels are healthy.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-rose-200 overflow-hidden">
            <table className="w-full text-sm text-left">

              <thead className="bg-rose-50 border-b border-rose-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-rose-700 uppercase tracking-wider">Item</th>
                  <th className="px-4 py-3 text-xs font-medium text-rose-700 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-xs font-medium text-rose-700 uppercase tracking-wider">In Stock</th>
                  <th className="px-4 py-3 text-xs font-medium text-rose-700 uppercase tracking-wider">Threshold</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-rose-100 bg-white">
                {lowStockItems.map((item) => (
                  <tr key={`${item.itemType}-${item.id}`} className="bg-rose-50">
                    <td className="px-4 py-3 font-medium text-stone-800">{item.name}</td>
                    <td className="px-4 py-3 text-stone-500">{item.itemType}</td>
                    <td className="px-4 py-3 font-semibold text-rose-700">{item.currentStock} {item.unit}</td>
                    <td className="px-4 py-3 text-stone-500">{item.lowStockThreshold} {item.unit}</td>
                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        )}
      </div>

      {/* ── Recent restocking activity ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-stone-800">Recent Restocking</h2>
          <Link href="/restocking" className="text-sm text-amber-700 hover:text-amber-900 font-medium">
            View all
          </Link>
        </div>

        {recentRecords.length === 0 ? (
          <p className="text-stone-500 text-sm">No restocking records yet.</p>
        ) : (
          <div className="rounded-lg border border-stone-200 overflow-hidden">
            <ul className="divide-y divide-stone-100 bg-white">
              {recentRecords.map((record) => (
                <li key={record.id} className="px-4 py-3 flex items-center justify-between hover:bg-stone-50">
                  <div>
                    <span className="text-sm font-medium text-stone-800">{record.itemName}</span>
                    <span className="ml-2 text-xs text-stone-500">{record.itemType === "ingredient" ? "Ingredient" : "Finished Good"}</span>
                    {record.notes && (
                      <p className="text-xs text-stone-500 mt-0.5">{record.notes}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-sm font-medium text-stone-700">+{record.quantityAdded}</p>
                    <p className="text-xs text-stone-500">{formatDate(record.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

    </div>
  );
}
