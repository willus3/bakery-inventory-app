// Client Component — required because we use React hooks (useState, useEffect).
"use client";

import { useState, useEffect } from "react";
import { getIngredients, getFinishedGoods } from "@/lib/firestore";
import { getRestockingRecords, addRestockingRecord } from "@/lib/firestore";

// Formats a Firestore Timestamp into a readable date + time string.
// Firestore returns a Timestamp object, not a plain JS Date, so we call
// .toDate() first to convert it before formatting.
// Returns "—" as a fallback if the timestamp hasn't resolved yet
// (serverTimestamp() can be null briefly right after a write).
const formatDate = (timestamp) => {
  if (!timestamp) return "—";
  const date = timestamp.toDate();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " " + date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

// Maps the raw itemType value stored in Firestore to a display label.
const formatItemType = (itemType) => {
  if (itemType === "ingredient") return "Ingredient";
  if (itemType === "finishedGood") return "Finished Good";
  return itemType;
};

// The main Restocking page.
// Form at the top to log a new restock event; permanent log table below.
export default function RestockingPage() {

  // ─── State ───────────────────────────────────────────────────────────────
  // The list of all restocking records, sorted newest-first.
  const [records, setRecords] = useState([]);

  // Controls the initial page load spinner for the records table.
  const [loading, setLoading] = useState(true);

  // The list of items (ingredients or finished goods) shown in the
  // Item Name dropdown. Repopulated whenever itemType changes.
  const [itemOptions, setItemOptions] = useState([]);

  // True while we're fetching items for the Item Name dropdown.
  // Used to show a "Loading..." placeholder in the dropdown.
  const [loadingItems, setLoadingItems] = useState(false);

  // All form field values in one object.
  const [formData, setFormData] = useState({
    itemType: "ingredient",   // default — drives which items load
    itemId: "",               // Firestore doc ID of the selected item
    itemName: "",             // copied from the selected item for log readability
    quantityAdded: "",
    notes: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // ─── Fetch records on mount ───────────────────────────────────────────────
  useEffect(() => {
    const fetchRecords = async () => {
      const data = await getRestockingRecords();
      setRecords(data);
      setLoading(false);
    };

    fetchRecords();
  }, []);

  // ─── Fetch item options whenever itemType changes ─────────────────────────
  // This useEffect re-runs on mount AND every time formData.itemType changes.
  // That means the dropdown auto-populates on first load (with ingredients)
  // and re-populates with the correct list whenever the user switches type.
  useEffect(() => {
    const fetchItems = async () => {
      setLoadingItems(true);

      const data = formData.itemType === "ingredient"
        ? await getIngredients()
        : await getFinishedGoods();

      setItemOptions(data);
      setLoadingItems(false);
    };

    fetchItems();
  }, [formData.itemType]);

  // ─── Form change handlers ─────────────────────────────────────────────────
  // Handles the Item Type dropdown specifically.
  // When the type changes we also clear the item selection, since the previous
  // item belongs to a different collection and is no longer valid.
  const handleTypeChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      itemType: e.target.value,
      itemId: "",
      itemName: "",
    }));
  };

  // Handles the Item Name dropdown.
  // Stores both the item's Firestore ID and its name — the ID is used to
  // reference the item; the name is copied into the record so history stays
  // readable even if that item is renamed or deleted later.
  const handleItemSelect = (e) => {
    const selectedId = e.target.value;
    const selectedItem = itemOptions.find((item) => item.id === selectedId);
    setFormData((prev) => ({
      ...prev,
      itemId: selectedId,
      itemName: selectedItem ? selectedItem.name : "",
    }));
  };

  // Handles all other form fields (quantityAdded, notes).
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ─── Form submit handler ──────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.itemId) {
      setError("Please select an item.");
      return;
    }
    if (!formData.quantityAdded || parseFloat(formData.quantityAdded) <= 0) {
      setError("Quantity added must be greater than 0.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await addRestockingRecord({
        itemId: formData.itemId,
        itemType: formData.itemType,
        itemName: formData.itemName,
        quantityAdded: parseFloat(formData.quantityAdded),
        notes: formData.notes.trim(),
      });

      // Reset form — keep itemType so the user can quickly log another
      // restock of the same type without switching back.
      setFormData((prev) => ({
        ...prev,
        itemId: "",
        itemName: "",
        quantityAdded: "",
        notes: "",
      }));

      // Re-fetch the log so the new record appears at the top.
      const updatedRecords = await getRestockingRecords();
      setRecords(updatedRecords);

    } catch (err) {
      console.error("Failed to add restocking record:", err);
      setError("Failed to save record. Please try again.");

    } finally {
      setSubmitting(false);
    }
  };

  // ─── Main render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">Restocking</h1>
        <p className="text-sm text-stone-400 mt-1">Log a restock event and view history</p>
      </div>

      {/* ── Log Restock form ── */}
      <div className="rounded-lg border border-stone-200 p-6">
        <h2 className="text-lg font-semibold text-stone-800 mb-4">Log Restock</h2>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Item Type and Item Name on the same row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Item Type dropdown */}
            <div>
              <label htmlFor="itemType" className="block text-sm font-medium text-stone-700 mb-1">
                Item Type
              </label>
              <select
                id="itemType"
                name="itemType"
                value={formData.itemType}
                onChange={handleTypeChange}
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              >
                <option value="ingredient">Ingredient</option>
                <option value="finishedGood">Finished Good</option>
              </select>
            </div>

            {/* Item Name dropdown — populated from the database */}
            <div>
              <label htmlFor="itemId" className="block text-sm font-medium text-stone-700 mb-1">
                Item Name <span className="text-rose-500">*</span>
              </label>
              <select
                id="itemId"
                name="itemId"
                value={formData.itemId}
                onChange={handleItemSelect}
                disabled={loadingItems}
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {/* Placeholder option — the user must make an active selection */}
                <option value="">
                  {loadingItems ? "Loading..." : "Select an item"}
                </option>
                {itemOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quantity and Notes on the same row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Quantity Added */}
            <div>
              <label htmlFor="quantityAdded" className="block text-sm font-medium text-stone-700 mb-1">
                Quantity Added <span className="text-rose-500">*</span>
              </label>
              <input
                id="quantityAdded"
                name="quantityAdded"
                type="number"
                min="0"
                step="any"
                value={formData.quantityAdded}
                onChange={handleChange}
                placeholder="0"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-stone-700 mb-1">
                Notes <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <input
                id="notes"
                name="notes"
                type="text"
                value={formData.notes}
                onChange={handleChange}
                placeholder="e.g. Weekly delivery"
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
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Saving..." : "Log Restock"}
          </button>

        </form>
      </div>

      {/* ── Restocking history table ── */}
      <div>
        <h2 className="text-lg font-semibold text-stone-800 mb-4">History</h2>

        {loading ? (
          <p className="text-stone-400 text-sm">Loading history...</p>
        ) : records.length === 0 ? (
          <p className="text-stone-400 text-sm">No restocking records yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full text-sm text-left">

              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Item</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Qty Added</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Notes</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100 bg-white">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 text-stone-500 whitespace-nowrap">
                      {formatDate(record.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-stone-800">
                      {record.itemName}
                    </td>
                    <td className="px-4 py-3 text-stone-500">
                      {formatItemType(record.itemType)}
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      {record.quantityAdded}
                    </td>
                    <td className="px-4 py-3 text-stone-400">
                      {/* Show the notes text, or a dash if none were provided */}
                      {record.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>

            </table>
          </div>
        )}
      </div>

    </div>
  );
}
