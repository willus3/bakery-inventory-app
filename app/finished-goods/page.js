// Client Component — required because we use React hooks (useState, useEffect).
"use client";

import { useState, useEffect } from "react";
import { getFinishedGoods, addFinishedGood, updateFinishedGood, deleteFinishedGood } from "@/lib/firestore";

// Full unit list from the project spec.
// Defined outside the component so it's only created once.
const UNIT_OPTIONS = ["g", "kg", "oz", "lbs", "ml", "L", "cups", "units", "dozen", "trays"];

// The main Finished Goods page.
// Displays all finished goods in a table and includes a form to add new ones.
export default function FinishedGoodsPage() {

  // ─── State ───────────────────────────────────────────────────────────────
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: "",
    unit: "units",       // sensible default for finished goods (loaves, cookies, etc.)
    currentStock: "",
    lowStockThreshold: "",
    price: "",           // optional — selling price
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // ─── Initial data fetch ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchGoods = async () => {
      const data = await getFinishedGoods();
      setFinishedGoods(data);
      setLoading(false);
    };

    fetchGoods();
  }, []);

  // ─── Edit handlers ───────────────────────────────────────────────────────
  // Enters edit mode for a row, seeding the edit form with the item's current values.
  const handleEditStart = (item) => {
    setEditingId(item.id);
    setEditFormData({
      name: item.name,
      unit: item.unit,
      currentStock: item.currentStock,
      lowStockThreshold: item.lowStockThreshold,
      // If price is 0 (stored as the "not set" default), show blank in the input
      // so it doesn't look like the user intentionally set a $0 price.
      price: item.price || "",
    });
  };

  // Exits edit mode without saving anything.
  const handleEditCancel = () => {
    setEditingId(null);
    setEditFormData({});
  };

  // Handles all input changes within the edit row.
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Saves the edited row to Firestore and refreshes the list.
  const handleEditSave = async (id) => {
    try {
      await updateFinishedGood(id, {
        name: editFormData.name.trim(),
        unit: editFormData.unit,
        currentStock: parseFloat(editFormData.currentStock) || 0,
        lowStockThreshold: parseFloat(editFormData.lowStockThreshold) || 0,
        price: parseFloat(editFormData.price) || 0,
      });

      const updatedList = await getFinishedGoods();
      setFinishedGoods(updatedList);

    } catch (err) {
      console.error("Failed to update finished good:", err);
      window.alert("Failed to save changes. Please try again.");

    } finally {
      setEditingId(null);
      setEditFormData({});
    }
  };

  // ─── Delete handler ──────────────────────────────────────────────────────
  const handleDelete = async (id, name) => {
    const confirmed = window.confirm(`Delete "${name}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(id);

    try {
      await deleteFinishedGood(id);
      const updatedList = await getFinishedGoods();
      setFinishedGoods(updatedList);

    } catch (err) {
      console.error("Failed to delete finished good:", err);
      window.alert("Failed to delete item. Please try again.");

    } finally {
      setDeletingId(null);
    }
  };

  // ─── Form change handler ─────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ─── Form submit handler ─────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError("Item name is required.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await addFinishedGood({
        name: formData.name.trim(),
        unit: formData.unit,
        currentStock: parseFloat(formData.currentStock) || 0,
        lowStockThreshold: parseFloat(formData.lowStockThreshold) || 0,
        price: parseFloat(formData.price) || 0,
      });

      setFormData({ name: "", unit: "units", currentStock: "", lowStockThreshold: "", price: "" });

      const updatedList = await getFinishedGoods();
      setFinishedGoods(updatedList);

    } catch (err) {
      console.error("Failed to add finished good:", err);
      setError("Failed to save item. Please try again.");

    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading finished goods...</p>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">Finished Goods</h1>
        <p className="text-sm text-stone-500 mt-1">
          {finishedGoods.length} item{finishedGoods.length !== 1 ? "s" : ""} total
        </p>
      </div>

      {/* ── Table or empty state ── */}
      {finishedGoods.length === 0 ? (
        <p className="text-stone-500 text-sm">No finished goods yet. Add one below.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-sm text-left">

            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Unit</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Current Stock</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Low Stock Alert</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 bg-white">
              {finishedGoods.map((item) => {
                const isLow = item.currentStock < item.lowStockThreshold;
                const isEditing = item.id === editingId;

                // ── Edit mode row ──────────────────────────────────────────
                if (isEditing) {
                  return (
                    <tr key={item.id} className="bg-amber-50">
                      <td className="px-4 py-2">
                        <input
                          name="name"
                          type="text"
                          value={editFormData.name}
                          onChange={handleEditChange}
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          name="unit"
                          value={editFormData.unit}
                          onChange={handleEditChange}
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        >
                          {UNIT_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          name="currentStock"
                          type="number"
                          min="0"
                          step="any"
                          value={editFormData.currentStock}
                          onChange={handleEditChange}
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          name="lowStockThreshold"
                          type="number"
                          min="0"
                          step="any"
                          value={editFormData.lowStockThreshold}
                          onChange={handleEditChange}
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          name="price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={editFormData.price}
                          onChange={handleEditChange}
                          placeholder="0.00"
                          className="w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                      </td>
                      <td className="px-4 py-2 flex gap-3">
                        <button
                          onClick={() => handleEditSave(item.id)}
                          className="text-sm font-medium text-amber-700 hover:text-amber-900"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleEditCancel}
                          className="text-sm font-medium text-stone-500 hover:text-stone-700"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  );
                }

                // ── Read mode row ──────────────────────────────────────────
                return (
                  <tr key={item.id} className={isLow ? "bg-rose-50" : "hover:bg-stone-50"}>
                    <td className="px-4 py-3 font-medium text-stone-800">{item.name}</td>
                    <td className="px-4 py-3 text-stone-500">{item.unit}</td>
                    <td className="px-4 py-3">
                      <span className={isLow ? "text-rose-700 font-semibold" : "text-stone-700"}>
                        {item.currentStock}
                      </span>
                      {isLow && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-700">
                          Low
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-500">{item.lowStockThreshold}</td>
                    <td className="px-4 py-3 text-stone-500">
                      {/* Show formatted price, or a dash if no price was set */}
                      {item.price ? `$${item.price.toFixed(2)}` : "—"}
                    </td>
                    <td className="px-4 py-3 flex gap-3">
                      <button
                        onClick={() => handleEditStart(item)}
                        disabled={editingId !== null || deletingId === item.id}
                        className="text-sm font-medium text-stone-500 hover:text-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        disabled={deletingId === item.id || editingId !== null}
                        className="text-sm font-medium text-rose-600 hover:text-rose-800 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {deletingId === item.id ? "Deleting..." : "Delete"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>
      )}

      {/* ── Add Finished Good form ── */}
      <div className="border-t border-stone-200 pt-8">
        <h2 className="text-lg font-semibold text-stone-800 mb-4">Add Finished Good</h2>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Name and Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-stone-700 mb-1">
                Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Sourdough Loaf"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="unit" className="block text-sm font-medium text-stone-700 mb-1">
                Unit
              </label>
              <select
                id="unit"
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              >
                {UNIT_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Stock numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="currentStock" className="block text-sm font-medium text-stone-700 mb-1">
                Current Stock
              </label>
              <input
                id="currentStock"
                name="currentStock"
                type="number"
                min="0"
                step="any"
                value={formData.currentStock}
                onChange={handleChange}
                placeholder="0"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="lowStockThreshold" className="block text-sm font-medium text-stone-700 mb-1">
                Low Stock Alert At
              </label>
              <input
                id="lowStockThreshold"
                name="lowStockThreshold"
                type="number"
                min="0"
                step="any"
                value={formData.lowStockThreshold}
                onChange={handleChange}
                placeholder="0"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Price — optional, half-width */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-stone-700 mb-1">
                Selling Price <span className="text-stone-500 font-normal">(optional)</span>
              </label>
              <input
                id="price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                value={formData.price}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Adding..." : "Add Finished Good"}
          </button>

        </form>
      </div>

    </div>
  );
}
