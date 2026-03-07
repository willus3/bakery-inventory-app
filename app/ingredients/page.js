// Client Component — required because we use React hooks (useState, useEffect).
"use client";

import { useState, useEffect } from "react";
import { getIngredients, addIngredient, updateIngredient, deleteIngredient } from "@/lib/firestore";

// The fixed list of unit options for the dropdown.
// Defined outside the component so it's created once, not on every render.
const UNIT_OPTIONS = ["g", "kg", "oz", "lbs", "ml", "L", "cups", "units", "dozen", "trays"];

// The main Ingredients page.
// Displays all ingredients in a table and includes a form to add new ones.
export default function IngredientsPage() {

  // ─── State ───────────────────────────────────────────────────────────────
  // Holds the array of ingredients fetched from Firestore.
  const [ingredients, setIngredients] = useState([]);

  // Controls the initial page load spinner. True until the first fetch completes.
  const [loading, setLoading] = useState(true);

  // Holds all form field values in one object. Using one object (instead of
  // four separate useState calls) lets us handle all fields with one function.
  const [formData, setFormData] = useState({
    name: "",
    supplierCode: "",    // optional — e.g. GFS-FLOUR-APF
    unit: "lbs",         // default to the most common unit
    currentStock: "",
    lowStockThreshold: "",
    costPerUnit: "",     // optional — used for recipe costing
  });

  // True while the addIngredient() call is in flight. Used to disable the
  // submit button and show "Adding..." so the user knows something is happening.
  const [submitting, setSubmitting] = useState(false);

  // Holds an error message string if the save fails, or null if no error.
  const [error, setError] = useState(null);

  // Holds the Firestore ID of the ingredient currently being deleted, or null.
  // Using an ID instead of a plain boolean lets us disable only the specific
  // row being deleted, rather than locking up the entire page.
  const [deletingId, setDeletingId] = useState(null);

  // Holds the Firestore ID of the row currently in edit mode, or null.
  // Only one row can be edited at a time — when this matches item.id, that
  // row renders as input fields instead of plain text.
  const [editingId, setEditingId] = useState(null);

  // Holds the live field values for the row being edited.
  // Seeded from the item's current data when Edit is clicked.
  const [editFormData, setEditFormData] = useState({});

  // Controls whether the Add Ingredient form is visible.
  const [showForm, setShowForm] = useState(false);

  // ─── Initial data fetch ──────────────────────────────────────────────────
  // Runs once when the component first mounts. Fetches all ingredients and
  // stores them in state, then hides the loading message.
  useEffect(() => {
    const fetchIngredients = async () => {
      const data = await getIngredients();
      setIngredients(data);
      setLoading(false);
    };

    fetchIngredients();
  }, []);

  // ─── Edit handlers ───────────────────────────────────────────────────────
  // Enters edit mode for a specific row.
  // Seeds editFormData with the item's current values so the inputs start
  // pre-populated rather than blank.
  const handleEditStart = (item) => {
    setEditingId(item.id);
    setEditFormData({
      name: item.name,
      supplierCode: item.supplierCode || "",
      unit: item.unit,
      currentStock: item.currentStock,
      lowStockThreshold: item.lowStockThreshold,
      costPerUnit: item.costPerUnit || "",
    });
  };

  // Cancels the in-progress edit and restores the row to read mode.
  // Nothing is written to Firestore — the original data is untouched.
  const handleEditCancel = () => {
    setEditingId(null);
    setEditFormData({});
  };

  // Handles input changes within the edit row.
  // Works the same way as handleChange on the add form — one function
  // covers all fields by using the input's `name` attribute as the key.
  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Saves the edited row to Firestore, then refreshes the list and exits edit mode.
  const handleEditSave = async (id) => {
    try {
      await updateIngredient(id, {
        name: editFormData.name.trim(),
        supplierCode: editFormData.supplierCode?.trim() || "",
        unit: editFormData.unit,
        // Convert string inputs back to numbers, fall back to 0 if empty
        currentStock: parseFloat(editFormData.currentStock) || 0,
        lowStockThreshold: parseFloat(editFormData.lowStockThreshold) || 0,
        costPerUnit: parseFloat(editFormData.costPerUnit) || 0,
      });

      // Re-fetch so the table reflects the saved values
      const updatedList = await getIngredients();
      setIngredients(updatedList);

    } catch (err) {
      console.error("Failed to update ingredient:", err);
      window.alert("Failed to save changes. Please try again.");

    } finally {
      // Exit edit mode whether the save succeeded or failed
      setEditingId(null);
      setEditFormData({});
    }
  };

  // ─── Delete handler ──────────────────────────────────────────────────────
  // Asks for confirmation, then deletes the ingredient and refreshes the list.
  // Accepts both the document ID and the name so the confirm dialog is specific.
  const handleDelete = async (id, name) => {
    // window.confirm() pauses execution and returns true (OK) or false (Cancel).
    // If the user cancels, we return early — nothing is changed.
    const confirmed = window.confirm(`Delete "${name}"? This cannot be undone.`);
    if (!confirmed) return;

    // Mark this specific row as deleting. Every other row is unaffected.
    setDeletingId(id);

    try {
      await deleteIngredient(id);

      // Re-fetch the list so the deleted row disappears without a page reload.
      const updatedList = await getIngredients();
      setIngredients(updatedList);

    } catch (err) {
      console.error("Failed to delete ingredient:", err);
      window.alert("Failed to delete ingredient. Please try again.");

    } finally {
      // Always clear the deleting state, whether the delete succeeded or failed.
      setDeletingId(null);
    }
  };

  // ─── Form change handler ─────────────────────────────────────────────────
  // Handles changes for ALL form inputs — text, number, and select alike.
  // `e.target.name` tells us which field changed (matches the `name` attribute
  // on each input). `e.target.value` is the new value.
  // The computed property `[name]` updates only that one key in the object,
  // leaving all other fields untouched.
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Opens the add form with a clean empty state.
  const handleNewIngredient = () => {
    setError(null);
    setShowForm(true);
  };

  // Closes and resets the add form without saving.
  const handleCancelForm = () => {
    setShowForm(false);
    setFormData({ name: "", supplierCode: "", unit: "lbs", currentStock: "", lowStockThreshold: "", costPerUnit: "" });
    setError(null);
  };

  // ─── Form submit handler ─────────────────────────────────────────────────
  // Validates the form, writes to Firestore, refreshes the list, and resets the form.
  const handleSubmit = async (e) => {
    // Prevent the browser's default form behavior (a full page reload).
    // Without this line, submitting the form would wipe out all React state.
    e.preventDefault();

    // Basic validation — name is the only required field.
    if (!formData.name.trim()) {
      setError("Ingredient name is required.");
      return;
    }

    // Duplicate name check — case-insensitive, trimmed.
    const trimmedName = formData.name.trim().toLowerCase();
    const nameTaken = ingredients.some(
      (ing) => ing.name.trim().toLowerCase() === trimmedName
    );
    if (nameTaken) {
      setError(`An ingredient named "${formData.name.trim()}" already exists.`);
      return;
    }

    // Clear any previous error and signal that saving has started.
    setError(null);
    setSubmitting(true);

    try {
      // Build the data object to send to Firestore.
      // parseFloat() converts the string from the input into a real number.
      // If the field was left empty, parseFloat returns NaN, so we fall back to 0.
      await addIngredient({
        name: formData.name.trim(),
        supplierCode: formData.supplierCode.trim(),
        unit: formData.unit,
        currentStock: parseFloat(formData.currentStock) || 0,
        lowStockThreshold: parseFloat(formData.lowStockThreshold) || 0,
        costPerUnit: parseFloat(formData.costPerUnit) || 0,
      });

      // Reset the form back to its initial empty state and close it.
      setFormData({ name: "", supplierCode: "", unit: "lbs", currentStock: "", lowStockThreshold: "", costPerUnit: "" });
      setShowForm(false);

      // Re-fetch the full list from Firestore so the new ingredient appears
      // in the table immediately without a full page reload.
      const updatedList = await getIngredients();
      setIngredients(updatedList);

    } catch (err) {
      // If the Firestore write failed for any reason, show an error message.
      console.error("Failed to add ingredient:", err);
      setError("Failed to save ingredient. Please try again.");

    } finally {
      // `finally` always runs — success or failure — so the button
      // always returns to its normal state and never gets stuck on "Adding...".
      setSubmitting(false);
    }
  };

  // ─── Loading state ───────────────────────────────────────────────────────
  // Only shown during the initial page load. Once loading is false, we never
  // return to this state — re-fetches after submit don't set loading to true.
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading ingredients...</p>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────
  // Collapsible add form appears first; the table renders below it.
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">Ingredients</h1>
          <p className="text-sm text-stone-500 mt-1">
            {ingredients.length} ingredient{ingredients.length !== 1 ? "s" : ""} total
          </p>
        </div>
        {!showForm && (
          <button
            onClick={handleNewIngredient}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors"
          >
            Add New Ingredient
          </button>
        )}
      </div>

      {/* ── Add Ingredient form ── */}
      {showForm && (
        <div className="rounded-lg border border-stone-200 p-6">

          {/* Form header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-stone-800">New Ingredient</h2>
            <button
              onClick={handleCancelForm}
              className="text-sm text-stone-500 hover:text-stone-800"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Name and Supplier Code on the same row */}
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
                  placeholder="e.g. All-Purpose Flour"
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="supplierCode" className="block text-sm font-medium text-stone-700 mb-1">
                  Supplier Code <span className="text-stone-500 font-normal">(optional)</span>
                </label>
                <input
                  id="supplierCode"
                  name="supplierCode"
                  type="text"
                  value={formData.supplierCode}
                  onChange={handleChange}
                  placeholder="e.g. GFS-FLOUR-APF"
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
            </div>

            {/* Unit and Cost per Unit on the same row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div>
                <label htmlFor="costPerUnit" className="block text-sm font-medium text-stone-700 mb-1">
                  Cost per Unit ($) <span className="text-stone-500 font-normal">(optional)</span>
                </label>
                <input
                  id="costPerUnit"
                  name="costPerUnit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.costPerUnit}
                  onChange={handleChange}
                  placeholder="e.g. 2.50 per lb"
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>
            </div>

            {/* Stock numbers on the same row */}
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

            {/* Error message — only rendered when error is not null */}
            {error && (
              <p className="text-sm text-rose-600">{error}</p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Adding..." : "Add Ingredient"}
            </button>

          </form>
        </div>
      )}

      {/* ── Ingredients table (or empty message) ── */}
      {ingredients.length === 0 ? (
        <p className="text-stone-500 text-sm">No ingredients yet. Add one above.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-sm text-left">

            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Unit</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Current Stock</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Low Stock Alert</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 bg-white">
              {ingredients.map((item) => {
                const isLow = item.currentStock < item.lowStockThreshold;
                const isEditing = item.id === editingId;

                // ── Edit mode row ──────────────────────────────────────────
                // Replaces plain text cells with input fields pre-filled with
                // the item's current values. Only one row is ever in this state.
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
                        {/* Supplier Code — optional, stacked below the name input in edit mode */}
                        <div className="mt-2">
                          <label className="block text-xs text-stone-500 mb-1">
                            Supplier Code <span className="text-stone-400">(optional)</span>
                          </label>
                          <input
                            name="supplierCode"
                            type="text"
                            value={editFormData.supplierCode ?? ""}
                            onChange={handleEditChange}
                            placeholder="e.g. GFS-FLOUR-APF"
                            className="w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                          />
                        </div>
                        {/* Cost per Unit — optional, stacked below supplier code in edit mode */}
                        <div className="mt-2">
                          <label className="block text-xs text-stone-500 mb-1">
                            Cost per Unit ($) <span className="text-stone-400">(optional)</span>
                          </label>
                          <input
                            name="costPerUnit"
                            type="number"
                            min="0"
                            step="0.01"
                            value={editFormData.costPerUnit ?? ""}
                            onChange={handleEditChange}
                            placeholder="0.00"
                            className="w-full rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                          />
                        </div>
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
                // The normal display. Unchanged from the original, except we
                // now also render an Edit button in the Actions column.
                return (
                  <tr key={item.id} className={isLow ? "bg-rose-50" : "hover:bg-stone-50"}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-800">{item.name}</div>
                      {/* Supplier code — shown as a muted label under the name when set */}
                      {item.supplierCode && (
                        <div className="text-xs text-stone-400 mt-0.5">Code: {item.supplierCode}</div>
                      )}
                      {/* Cost per unit — shown as a muted label when set and greater than 0 */}
                      {item.costPerUnit > 0 && (
                        <div className="text-xs text-stone-400 mt-0.5">
                          ${item.costPerUnit.toFixed(2)}/{item.unit}
                        </div>
                      )}
                    </td>
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
                    <td className="px-4 py-3 flex gap-3">
                      <button
                        onClick={() => handleEditStart(item)}
                        // Disable Edit on all rows while any row is being edited,
                        // or while this row is being deleted.
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

    </div>
  );
}
