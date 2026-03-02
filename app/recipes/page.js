// Client Component — uses hooks throughout.
"use client";

import { useState, useEffect, Fragment } from "react";
import {
  getRecipes,
  addRecipe,
  updateRecipe,
  archiveRecipe,
  addFinishedGood,
  addIngredient,
} from "@/lib/firestore";
import { getIngredients, getFinishedGoods } from "@/lib/firestore";
import SearchableSelect from "@/components/SearchableSelect";

// Full unit list — used for yield unit and ingredient unit dropdowns.
const UNIT_OPTIONS = ["g", "kg", "oz", "lbs", "ml", "L", "cups", "units", "dozen", "trays"];

// Returns a blank ingredient row object.
// Pulled into a named function so it's easy to reuse when adding rows
// and when resetting the form — both need the same empty shape.
const emptyIngredientRow = () => ({
  ingredientId:   "",
  ingredientName: "",
  quantity:       "",
  unit:           "g",
});

// Returns the blank state for the recipe's scalar fields (everything except
// the ingredients array, which is managed separately in ingredientRows).
const emptyFormData = () => ({
  name:             "",
  finishedGoodId:   "",
  finishedGoodName: "",
  yieldQuantity:    "",
  yieldUnit:        "units",
});

// The main Recipes page.
// Shows a table of active recipes with expand-to-see-ingredients rows.
// A toggleable form at the bottom handles both adding and editing.
export default function RecipesPage() {

  // ─── Recipe list state ───────────────────────────────────────────────────
  const [recipes,       setRecipes]       = useState([]);
  const [loading,       setLoading]       = useState(true);

  // ─── Dropdown data (fetched once on mount, used by the form) ────────────
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [ingredients,   setIngredients]   = useState([]);

  // ─── Expand/collapse (one recipe row open at a time) ─────────────────────
  // Holds the Firestore ID of the currently expanded row, or null.
  const [expandedId, setExpandedId] = useState(null);

  // ─── Form visibility and mode ────────────────────────────────────────────
  // showForm controls whether the add/edit form is rendered at all.
  // editingId is null when adding, or a recipe ID when editing.
  const [showForm,   setShowForm]   = useState(false);
  const [editingId,  setEditingId]  = useState(null);

  // ─── Form field state ────────────────────────────────────────────────────
  // formData holds scalar fields. ingredientRows holds the dynamic array.
  // They're kept separate because they're updated by different handlers.
  const [formData,       setFormData]       = useState(emptyFormData());
  const [ingredientRows, setIngredientRows] = useState([emptyIngredientRow()]);

  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState(null);
  const [archivingId, setArchivingId] = useState(null);

  // ─── Quick-add finished good modal ───────────────────────────────────────
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [quickAddForm,      setQuickAddForm]      = useState({ name: "", unit: "units" });
  const [quickAddSaving,    setQuickAddSaving]    = useState(false);
  const [quickAddError,     setQuickAddError]     = useState(null);

  // ─── Quick-add ingredient modal ───────────────────────────────────────────
  // quickAddIngredientRowIndex tracks which row triggered the modal so the
  // new ingredient gets selected in the correct row after creation.
  const [showQuickAddIngredientModal, setShowQuickAddIngredientModal] = useState(false);
  const [quickAddIngredientForm,      setQuickAddIngredientForm]      = useState({ name: "", unit: "g", currentStock: 0 });
  const [quickAddIngredientSaving,    setQuickAddIngredientSaving]    = useState(false);
  const [quickAddIngredientRowIndex,  setQuickAddIngredientRowIndex]  = useState(null);
  const [quickAddIngredientError,     setQuickAddIngredientError]     = useState(null);

  // ─── Initial data fetch ──────────────────────────────────────────────────
  // Fetch all three collections in parallel. Recipes is the primary data;
  // finishedGoods and ingredients populate the form dropdowns.
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [recipeData, finishedGoodData, ingredientData] = await Promise.all([
          getRecipes(),
          getFinishedGoods(),
          getIngredients(),
        ]);
        setRecipes(recipeData);
        setFinishedGoods(finishedGoodData);
        setIngredients(ingredientData);
      } catch (err) {
        console.error("Failed to load recipes page data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // ─── Expand / collapse handler ───────────────────────────────────────────
  // Clicking the same row a second time collapses it.
  const handleToggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // ─── Form open / close ───────────────────────────────────────────────────
  // Opens the add form with blank fields.
  const handleNewRecipe = () => {
    setEditingId(null);
    setFormData(emptyFormData());
    setIngredientRows([emptyIngredientRow()]);
    setError(null);
    setShowForm(true);
  };

  // Closes the form and resets all form state.
  const handleCancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyFormData());
    setIngredientRows([emptyIngredientRow()]);
    setError(null);
  };

  // ─── Edit handler ────────────────────────────────────────────────────────
  // Seeds the form with the recipe's existing values.
  // Note: when work orders are added (Phase D), add a check here to block
  // editing if any open work order references this recipe ID.
  const handleEditStart = (recipe) => {
    setEditingId(recipe.id);
    setFormData({
      name:             recipe.name,
      finishedGoodId:   recipe.finishedGoodId,
      finishedGoodName: recipe.finishedGoodName,
      yieldQuantity:    recipe.yieldQuantity,
      yieldUnit:        recipe.yieldUnit,
    });
    // Seed ingredient rows from the saved array. Each row already has the
    // right shape, so we can use them directly.
    setIngredientRows(recipe.ingredients.map((ing) => ({ ...ing })));
    setError(null);
    setShowForm(true);
    // Scroll the form into view
    setTimeout(() => {
      document.getElementById("recipe-form")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  // ─── Archive handler ─────────────────────────────────────────────────────
  const handleArchive = async (id, name) => {
    const confirmed = window.confirm(
      `Archive "${name}"? It will no longer appear in the active list. This cannot be undone.`
    );
    if (!confirmed) return;

    setArchivingId(id);
    try {
      await archiveRecipe(id);
      const updatedList = await getRecipes();
      setRecipes(updatedList);
    } catch (err) {
      console.error("Failed to archive recipe:", err);
      window.alert("Failed to archive recipe. Please try again.");
    } finally {
      setArchivingId(null);
    }
  };

  // ─── Scalar form change handler ──────────────────────────────────────────
  // Handles name, yieldQuantity, and yieldUnit — the straightforward fields.
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Handles the finished good dropdown.
  // Stores both the ID and the display name — the name is written into the
  // recipe document so history stays readable if the good is later renamed.
  // The sentinel "create new" path is handled by SearchableSelect's onCreateNew.
  const handleFinishedGoodSelect = (val) => {
    const selectedItem = finishedGoods.find((fg) => fg.id === val);
    setFormData((prev) => ({
      ...prev,
      finishedGoodId:   val,
      finishedGoodName: selectedItem ? selectedItem.name : "",
    }));
  };

  // Creates a new finished good from the quick-add modal, re-fetches the
  // finished goods list, and auto-selects the new item in the recipe form.
  const handleQuickAddCreate = async () => {
    if (!quickAddForm.name.trim()) return;

    // Duplicate name check against the already-loaded finishedGoods array.
    const dupName = quickAddForm.name.trim().toLowerCase();
    const isDuplicate = finishedGoods.some(
      (fg) => fg.name.trim().toLowerCase() === dupName
    );
    if (isDuplicate) {
      setQuickAddError(`A finished good named "${quickAddForm.name.trim()}" already exists.`);
      return;
    }
    setQuickAddError(null);

    setQuickAddSaving(true);
    try {
      const docRef = await addFinishedGood({
        name:              quickAddForm.name.trim(),
        unit:              quickAddForm.unit,
        currentStock:      0,
        lowStockThreshold: 0,
        price:             "",
      });
      // Re-fetch so the new item appears in the dropdown.
      const updatedGoods = await getFinishedGoods();
      setFinishedGoods(updatedGoods);
      // Auto-select the newly created finished good in the recipe form.
      setFormData((prev) => ({
        ...prev,
        finishedGoodId:   docRef.id,
        finishedGoodName: quickAddForm.name.trim(),
      }));
      // Close and reset the modal.
      setShowQuickAddModal(false);
      setQuickAddForm({ name: "", unit: "units" });
    } catch (err) {
      console.error("Failed to create finished good:", err);
    } finally {
      setQuickAddSaving(false);
    }
  };

  // ─── Dynamic ingredient row handlers ────────────────────────────────────
  //
  // The ingredientRows array is the core of this form's complexity.
  // Each entry is: { ingredientId, ingredientName, quantity, unit }
  //
  // All three handlers below follow the same immutable update pattern:
  // never mutate the array directly — always return a new array via
  // map() or filter(). This is what React needs to detect the change
  // and re-render the correct rows.

  // Adds a new blank row at the bottom of the ingredient list.
  const handleAddIngredientRow = () => {
    setIngredientRows((prev) => [...prev, emptyIngredientRow()]);
  };

  // Removes the row at `index`.
  // The last remaining row cannot be removed — at least one is always required.
  const handleRemoveIngredientRow = (index) => {
    setIngredientRows((prev) => prev.filter((_, i) => i !== index));
  };

  // Updates a single field (quantity or unit) within the row at `index`.
  // `field` is "quantity" or "unit" — passed in from the input's onChange.
  const handleIngredientFieldChange = (index, field, value) => {
    setIngredientRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  // Handles the ingredient dropdown — a special case because selecting an
  // ingredient must update THREE fields at once: ingredientId, ingredientName,
  // and unit (auto-filled from the ingredient's own stored unit to reduce errors).
  // The sentinel "add new" path is handled by SearchableSelect's onCreateNew.
  const handleIngredientSelect = (index, selectedId) => {
    const selectedItem = ingredients.find((ing) => ing.id === selectedId);
    setIngredientRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        return {
          ...row,
          ingredientId:   selectedId,
          ingredientName: selectedItem ? selectedItem.name : "",
          // Auto-fill unit from the ingredient's own unit — saves clicks
          // and reduces the chance of logging "2 lbs of flour" as "2 g".
          // The user can still change it if the recipe calls for a different unit.
          unit: selectedItem ? selectedItem.unit : row.unit,
        };
      })
    );
  };

  // Creates a new ingredient from the quick-add modal, re-fetches the
  // ingredients list, and auto-selects the new item in the triggering row.
  const handleQuickAddIngredientCreate = async () => {
    if (!quickAddIngredientForm.name.trim()) return;

    // Duplicate name check against the already-loaded ingredients array.
    const dupName = quickAddIngredientForm.name.trim().toLowerCase();
    const isDuplicate = ingredients.some(
      (ing) => ing.name.trim().toLowerCase() === dupName
    );
    if (isDuplicate) {
      setQuickAddIngredientError(`An ingredient named "${quickAddIngredientForm.name.trim()}" already exists.`);
      return;
    }
    setQuickAddIngredientError(null);

    setQuickAddIngredientSaving(true);
    try {
      const docRef = await addIngredient({
        name:              quickAddIngredientForm.name.trim(),
        unit:              quickAddIngredientForm.unit,
        currentStock:      parseFloat(quickAddIngredientForm.currentStock) || 0,
        lowStockThreshold: 0,
      });
      // Re-fetch so the new item appears in all ingredient dropdowns.
      const updatedIngredients = await getIngredients();
      setIngredients(updatedIngredients);
      // Auto-select the new ingredient in the row that triggered the modal.
      setIngredientRows((prev) =>
        prev.map((row, i) => {
          if (i !== quickAddIngredientRowIndex) return row;
          return {
            ...row,
            ingredientId:   docRef.id,
            ingredientName: quickAddIngredientForm.name.trim(),
            unit:           quickAddIngredientForm.unit,
          };
        })
      );
      // Close and reset the modal.
      setShowQuickAddIngredientModal(false);
      setQuickAddIngredientForm({ name: "", unit: "g", currentStock: 0 });
      setQuickAddIngredientRowIndex(null);
    } catch (err) {
      console.error("Failed to create ingredient:", err);
    } finally {
      setQuickAddIngredientSaving(false);
    }
  };

  // ─── Form submit handler ─────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    // ── Validation ──────────────────────────────────────────────────────────
    if (!formData.name.trim()) {
      setError("Recipe name is required.");
      return;
    }
    if (!formData.finishedGoodId) {
      setError("Please select a linked finished good.");
      return;
    }
    if (!formData.yieldQuantity || parseFloat(formData.yieldQuantity) <= 0) {
      setError("Yield quantity must be greater than 0.");
      return;
    }
    // Every ingredient row must have an ingredient selected and a quantity > 0.
    const hasIncompleteRow = ingredientRows.some(
      (row) => !row.ingredientId || !row.quantity || parseFloat(row.quantity) <= 0
    );
    if (hasIncompleteRow) {
      setError("Each ingredient row must have an ingredient selected and a quantity greater than 0.");
      return;
    }

    setError(null);
    setSubmitting(true);

    // Build the clean data object to send to Firestore.
    const recipeData = {
      name:             formData.name.trim(),
      finishedGoodId:   formData.finishedGoodId,
      finishedGoodName: formData.finishedGoodName,
      yieldQuantity:    parseFloat(formData.yieldQuantity),
      yieldUnit:        formData.yieldUnit,
      // Convert quantity strings to numbers before saving.
      ingredients: ingredientRows.map((row) => ({
        ingredientId:   row.ingredientId,
        ingredientName: row.ingredientName,
        quantity:       parseFloat(row.quantity),
        unit:           row.unit,
      })),
    };

    try {
      if (editingId) {
        await updateRecipe(editingId, recipeData);
      } else {
        await addRecipe(recipeData);
      }

      // Refresh the list and close the form.
      const updatedList = await getRecipes();
      setRecipes(updatedList);
      handleCancelForm();

    } catch (err) {
      console.error("Failed to save recipe:", err);
      setError("Failed to save recipe. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading recipes...</p>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">Recipes</h1>
          <p className="text-sm text-stone-500 mt-1">
            {recipes.length} active recipe{recipes.length !== 1 ? "s" : ""}
          </p>
        </div>
        {!showForm && (
          <button
            onClick={handleNewRecipe}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors"
          >
            New Recipe
          </button>
        )}
      </div>

      {/* ── Recipe table ── */}
      {recipes.length === 0 ? (
        <p className="text-stone-500 text-sm">No active recipes yet. Add one below.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="w-full text-sm text-left">

            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                {/* Empty column for the expand chevron */}
                <th className="w-8 px-3 py-3" />
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Finished Good</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Yield</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Ingredients</th>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 bg-white">
              {recipes.map((recipe) => {
                const isExpanded = recipe.id === expandedId;

                return (
                  // React.Fragment with a key lets us return two <tr>s per recipe
                  // without breaking the table structure with a wrapper div.
                  <
                      Fragment key={recipe.id}
                  >
                    {/* ── Summary row ── */}
                    <tr
                      className="hover:bg-stone-50 cursor-pointer"
                      onClick={() => handleToggleExpand(recipe.id)}
                    >
                      {/* Chevron icon — rotates when expanded */}
                      <td className="px-3 py-3">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className={`h-4 w-4 text-stone-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-800">{recipe.name}</td>
                      <td className="px-4 py-3 text-stone-500">{recipe.finishedGoodName}</td>
                      <td className="px-4 py-3 text-stone-500">
                        {recipe.yieldQuantity} {recipe.yieldUnit}
                      </td>
                      <td className="px-4 py-3 text-stone-500">
                        {recipe.ingredients.length} item{recipe.ingredients.length !== 1 ? "s" : ""}
                      </td>
                      <td
                        className="px-4 py-3 flex gap-3"
                        // Stop the row's onClick from firing when the user
                        // clicks Edit or Archive — those have their own handlers.
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleEditStart(recipe)}
                          disabled={archivingId === recipe.id}
                          className="text-sm font-medium text-stone-500 hover:text-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleArchive(recipe.id, recipe.name)}
                          disabled={archivingId === recipe.id}
                          className="text-sm font-medium text-amber-700 hover:text-amber-900 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {archivingId === recipe.id ? "Archiving..." : "Archive"}
                        </button>
                      </td>
                    </tr>

                    {/* ── Expanded ingredient list row ── */}
                    {/* Only rendered when this recipe is the expanded one.
                        colSpan=6 makes this row span all columns so it looks
                        like a panel attached to the row above. */}
                    {isExpanded && (
                      <tr key={`${recipe.id}-expanded`}>
                        <td colSpan={6} className="px-6 py-4 bg-stone-50 border-t border-stone-100">
                          <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">
                            Ingredients — per batch of {recipe.yieldQuantity} {recipe.yieldUnit}
                          </p>
                          <ul className="space-y-1">
                            {recipe.ingredients.map((ing, i) => (
                              <li key={i} className="flex items-center gap-2 text-sm text-stone-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                <span className="font-medium">{ing.ingredientName}</span>
                                <span className="text-stone-500">— {ing.quantity} {ing.unit}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>

          </table>
        </div>
      )}

      {/* ── Add / Edit Recipe form ── */}
      {showForm && (
        <div id="recipe-form" className="border-t border-stone-200 pt-8">

          {/* Form header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-stone-800">
              {editingId ? "Edit Recipe" : "New Recipe"}
            </h2>
            <button
              onClick={handleCancelForm}
              className="text-sm text-stone-500 hover:text-stone-800"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── Scalar fields ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Recipe name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-stone-700 mb-1">
                  Recipe Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="name" name="name" type="text"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Classic Sourdough"
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>

              {/* Linked finished good */}
              <div>
                <label htmlFor="finishedGoodId" className="block text-sm font-medium text-stone-700 mb-1">
                  Finished Good <span className="text-rose-500">*</span>
                </label>
                <SearchableSelect
                  options={finishedGoods.map((fg) => ({ value: fg.id, label: fg.name }))}
                  value={formData.finishedGoodId}
                  onChange={handleFinishedGoodSelect}
                  placeholder="Select finished good"
                  allowCreate
                  onCreateNew={() => { setQuickAddError(null); setShowQuickAddModal(true); }}
                  createLabel="+ Create new finished good"
                />
              </div>

              {/* Yield quantity */}
              <div>
                <label htmlFor="yieldQuantity" className="block text-sm font-medium text-stone-700 mb-1">
                  Yield per Batch <span className="text-rose-500">*</span>
                </label>
                <input
                  id="yieldQuantity" name="yieldQuantity" type="number"
                  min="0" step="any"
                  value={formData.yieldQuantity}
                  onChange={handleChange}
                  placeholder="0"
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>

              {/* Yield unit */}
              <div>
                <label htmlFor="yieldUnit" className="block text-sm font-medium text-stone-700 mb-1">
                  Yield Unit
                </label>
                <select
                  id="yieldUnit" name="yieldUnit"
                  value={formData.yieldUnit}
                  onChange={handleChange}
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

            </div>

            {/* ── Ingredient rows ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-stone-700">
                  Ingredients <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleAddIngredientRow}
                  className="text-sm font-medium text-amber-700 hover:text-amber-900"
                >
                  + Add ingredient
                </button>
              </div>

              <div className="space-y-2">
                {ingredientRows.map((row, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_100px_100px_auto] gap-2 items-center"
                  >
                    {/* Ingredient dropdown */}
                    <SearchableSelect
                      options={ingredients.map((ing) => ({ value: ing.id, label: ing.name }))}
                      value={row.ingredientId}
                      onChange={(val) => handleIngredientSelect(index, val)}
                      placeholder="Select ingredient"
                      allowCreate
                      onCreateNew={() => {
                        setQuickAddIngredientRowIndex(index);
                        setQuickAddIngredientError(null);
                        setShowQuickAddIngredientModal(true);
                      }}
                      createLabel="+ Add new ingredient"
                    />

                    {/* Quantity */}
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Qty"
                      value={row.quantity}
                      onChange={(e) => handleIngredientFieldChange(index, "quantity", e.target.value)}
                      className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                    />

                    {/* Unit */}
                    <select
                      value={row.unit}
                      onChange={(e) => handleIngredientFieldChange(index, "unit", e.target.value)}
                      className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>

                    {/* Remove button — hidden when only one row remains */}
                    {ingredientRows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredientRow(index)}
                        className="text-sm font-medium text-rose-500 hover:text-rose-700 px-1"
                        aria-label="Remove ingredient row"
                      >
                        ✕
                      </button>
                    ) : (
                      // Placeholder to keep the grid aligned when there's only one row
                      <span className="w-6" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <p className="text-sm text-rose-600">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting
                ? (editingId ? "Saving..." : "Adding...")
                : (editingId ? "Save Changes" : "Add Recipe")}
            </button>

          </form>
        </div>
      )}

      {/* ── Quick-add ingredient modal ── */}
      {showQuickAddIngredientModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => {
            setShowQuickAddIngredientModal(false);
            setQuickAddIngredientForm({ name: "", unit: "g", currentStock: 0 });
            setQuickAddIngredientRowIndex(null);
            setQuickAddIngredientError(null);
          }}
        >
          <div
            className="bg-white rounded-lg border border-stone-200 shadow-xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-stone-800 mb-4">
              Add Ingredient
            </h2>

            <div className="space-y-4">

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={quickAddIngredientForm.name}
                  onChange={(e) =>
                    setQuickAddIngredientForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. All-Purpose Flour"
                  autoFocus
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Unit
                </label>
                <select
                  value={quickAddIngredientForm.unit}
                  onChange={(e) =>
                    setQuickAddIngredientForm((prev) => ({ ...prev, unit: e.target.value }))
                  }
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {/* Current Stock */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Current Stock
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={quickAddIngredientForm.currentStock}
                  onChange={(e) =>
                    setQuickAddIngredientForm((prev) => ({ ...prev, currentStock: e.target.value }))
                  }
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>

            </div>

            {/* Inline error */}
            {quickAddIngredientError && (
              <p className="text-sm text-rose-600 mt-3">{quickAddIngredientError}</p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowQuickAddIngredientModal(false);
                  setQuickAddIngredientForm({ name: "", unit: "g", currentStock: 0 });
                  setQuickAddIngredientRowIndex(null);
                  setQuickAddIngredientError(null);
                }}
                className="px-4 py-2 rounded-md text-sm font-medium text-stone-600 hover:text-stone-800 hover:bg-stone-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleQuickAddIngredientCreate}
                disabled={quickAddIngredientSaving || !quickAddIngredientForm.name.trim()}
                className="px-4 py-2 rounded-md bg-amber-500 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {quickAddIngredientSaving ? "Adding..." : "Add Ingredient"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Quick-add finished good modal ── */}
      {/* Rendered outside the recipe form so it sits on top of the whole page. */}
      {showQuickAddModal && (
        // Backdrop — clicking it cancels the modal without changing the form.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => {
            setShowQuickAddModal(false);
            setQuickAddForm({ name: "", unit: "units" });
            setQuickAddError(null);
          }}
        >
          {/* Panel — stopPropagation prevents backdrop click from firing */}
          <div
            className="bg-white rounded-lg border border-stone-200 shadow-xl w-full max-w-sm mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-stone-800 mb-4">
              Create Finished Good
            </h2>

            <div className="space-y-4">

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={quickAddForm.name}
                  onChange={(e) =>
                    setQuickAddForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Sourdough Loaf"
                  autoFocus
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>

              {/* Unit */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Unit
                </label>
                <select
                  value={quickAddForm.unit}
                  onChange={(e) =>
                    setQuickAddForm((prev) => ({ ...prev, unit: e.target.value }))
                  }
                  className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

            </div>

            {/* Inline error */}
            {quickAddError && (
              <p className="text-sm text-rose-600 mt-3">{quickAddError}</p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowQuickAddModal(false);
                  setQuickAddForm({ name: "", unit: "units" });
                  setQuickAddError(null);
                }}
                className="px-4 py-2 rounded-md text-sm font-medium text-stone-600 hover:text-stone-800 hover:bg-stone-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleQuickAddCreate}
                disabled={quickAddSaving || !quickAddForm.name.trim()}
                className="px-4 py-2 rounded-md bg-amber-500 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {quickAddSaving ? "Creating..." : "Create"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
