// Client Component — uses hooks throughout.
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  getFinishedGoods,
  getRecipes,
  getDemandPlans,
  addDemandPlan,
  cancelDemandPlan,
  createWorkOrderFromDemandPlan,
} from "@/lib/firestore";

// Returns the blank form state. Extracted into a function so we can call it
// both for the initial state and when resetting after a successful submit.
const emptyFormData = () => ({
  finishedGoodId: "",
  targetQuantity:  "",
  requiredBy:      "",
  notes:           "",
});

// The main Demand Planning page.
// Shows a planning form at the top and a table of demand plans below.
export default function DemandPage() {
  const { user }   = useAuth();
  const router     = useRouter();

  // ─── Fetched data ────────────────────────────────────────────────────────
  const [demandPlans,   setDemandPlans]   = useState([]);
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [recipes,       setRecipes]       = useState([]);
  const [loading,       setLoading]       = useState(true);

  // ─── UI state ────────────────────────────────────────────────────────────
  // showAll toggles between hiding cancelled plans and showing everything.
  const [showAll,                  setShowAll]                  = useState(false);
  const [submitting,               setSubmitting]               = useState(false);
  const [cancellingId,             setCancellingId]             = useState(null);
  // Tracks which plan is mid-flight for work order creation so we can show
  // a "Creating..." loading state on that row's button.
  const [creatingWorkOrderForId,   setCreatingWorkOrderForId]   = useState(null);
  const [error,                    setError]                    = useState(null);

  // ─── Form state ──────────────────────────────────────────────────────────
  // Only the fields the user directly controls are stored in state.
  // All calculated values (shortfall, batchesRequired) are derived below.
  const [formData, setFormData] = useState(emptyFormData());

  // ─── Derived values (not stored in state) ────────────────────────────────
  // These are plain variables recalculated every render from formData +
  // loaded data. No useEffect needed — when formData changes, React
  // re-renders, and these compute fresh values automatically.
  //
  // selectedGood and selectedRecipe are found by matching the chosen
  // finishedGoodId against the loaded arrays.
  const selectedGood   = finishedGoods.find((fg) => fg.id === formData.finishedGoodId) ?? null;
  const selectedRecipe = recipes.find((r) => r.finishedGoodId === formData.finishedGoodId) ?? null;
  const currentStock   = selectedGood?.currentStock ?? null;
  const recipeYield    = selectedRecipe?.yieldQuantity ?? null;

  // Parse the target quantity input string to a number.
  // parseFloat("") returns NaN, so we fall back to 0 with the || operator.
  const targetQty = parseFloat(formData.targetQuantity) || 0;

  // Shortfall: how many more units we need to produce.
  // Never negative — if stock already covers the target, shortfall is 0.
  const shortfall = currentStock !== null
    ? Math.max(0, targetQty - currentStock)
    : 0;

  // batchesRequired: how many full batches the recipe must run to cover shortfall.
  // null means "can't calculate" (no recipe found for this finished good).
  const batchesRequired = !recipeYield
    ? null
    : shortfall === 0
      ? 0
      : Math.ceil(shortfall / recipeYield);

  // ─── Initial data fetch ──────────────────────────────────────────────────
  // Fetch all three collections in parallel. Promise.all means we fire all
  // three requests at once instead of waiting for each one to finish before
  // starting the next — roughly 3× faster on a cold load.
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [plansData, goodsData, recipesData] = await Promise.all([
          getDemandPlans(),
          getFinishedGoods(),
          getRecipes(),
        ]);
        setDemandPlans(plansData);
        setFinishedGoods(goodsData);
        setRecipes(recipesData);
      } catch (err) {
        console.error("Failed to load demand planning data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // ─── Form handlers ───────────────────────────────────────────────────────

  // Generic handler for the targetQuantity, requiredBy, and notes inputs.
  // Uses the input's `name` attribute to know which formData field to update.
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Finished good dropdown needs its own handler because selecting a new
  // finished good implicitly changes which recipe and stock level are shown.
  // We only store the ID here — selectedGood and selectedRecipe are derived.
  const handleFinishedGoodSelect = (e) => {
    setFormData((prev) => ({ ...prev, finishedGoodId: e.target.value }));
  };

  // Validates the form, builds the snapshot object, and writes to Firestore.
  const handleSubmit = async (e) => {
    e.preventDefault();

    // ── Validation ────────────────────────────────────────────────────────
    if (!formData.finishedGoodId) {
      setError("Please select a finished good.");
      return;
    }
    if (!formData.targetQuantity || parseFloat(formData.targetQuantity) <= 0) {
      setError("Target quantity must be greater than 0.");
      return;
    }
    if (!formData.requiredBy) {
      setError("Please set a required-by date.");
      return;
    }
    if (!selectedRecipe) {
      setError(
        `No active recipe found for "${selectedGood?.name}". Add a recipe on the Recipes page first.`
      );
      return;
    }

    setError(null);
    setSubmitting(true);

    // ── Build the plan object ─────────────────────────────────────────────
    // We snapshot the calculated values at the moment of creation so the
    // plan record remains accurate even if stock levels or the recipe change.
    const planData = {
      finishedGoodId:   formData.finishedGoodId,
      finishedGoodName: selectedGood.name,
      targetQuantity:   parseFloat(formData.targetQuantity),
      currentStock:     currentStock,
      shortfall:        shortfall,
      batchesRequired:  batchesRequired ?? 0,
      recipeId:         selectedRecipe.id,
      recipeName:       selectedRecipe.name,
      recipeYield:      recipeYield,
      status:           "open",
      requiredBy:       formData.requiredBy,    // stored as "YYYY-MM-DD" string
      notes:            formData.notes.trim(),
      createdBy:        user?.email ?? "",
    };

    try {
      await addDemandPlan(planData);
      // Re-fetch the full list so the table reflects the new plan.
      const updatedPlans = await getDemandPlans();
      setDemandPlans(updatedPlans);
      // Reset form to blank state.
      setFormData(emptyFormData());
    } catch (err) {
      console.error("Failed to create demand plan:", err);
      setError("Failed to create demand plan. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Soft-cancels a plan after a confirmation prompt.
  const handleCancel = async (id, name) => {
    const confirmed = window.confirm(
      `Cancel the demand plan for "${name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setCancellingId(id);
    try {
      await cancelDemandPlan(id);
      const updatedPlans = await getDemandPlans();
      setDemandPlans(updatedPlans);
    } catch (err) {
      console.error("Failed to cancel demand plan:", err);
      window.alert("Failed to cancel demand plan. Please try again.");
    } finally {
      setCancellingId(null);
    }
  };

  // Creates a work order from a demand plan and navigates to /work-orders.
  // Uses an atomic batch write in Firestore — either the work order is created
  // AND the plan is marked "fulfilled", or neither happens.
  // router.push() is a client-side navigation (no page reload) that fires only
  // after the async write succeeds. If the write throws, we show an error alert
  // and stay on this page.
  const handleCreateWorkOrder = async (plan) => {
    setCreatingWorkOrderForId(plan.id);
    try {
      await createWorkOrderFromDemandPlan(plan, user?.email ?? "");
      // Navigate to the work orders page. The new work order is already in
      // Firestore, so the work orders page will fetch and display it on load.
      router.push("/work-orders");
    } catch (err) {
      console.error("Failed to create work order from demand plan:", err);
      window.alert("Failed to create work order. Please try again.");
    } finally {
      setCreatingWorkOrderForId(null);
    }
  };

  // ─── Table filtering ─────────────────────────────────────────────────────
  // When showAll is false, hide only cancelled plans.
  // Fulfilled plans stay visible so the baker can see which demand plans
  // have already been converted to work orders.
  const visiblePlans = showAll
    ? demandPlans
    : demandPlans.filter((p) => p.status !== "cancelled");

  // ─── Date formatting ─────────────────────────────────────────────────────
  // Converts the stored "YYYY-MM-DD" string to a more readable "MM/DD/YYYY".
  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    const [year, month, day] = dateStr.split("-");
    return `${month}/${day}/${year}`;
  };

  // ─── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading demand planning...</p>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">Demand Planning</h1>
        <p className="text-sm text-stone-500 mt-1">
          Set production targets and calculate how many batches to run.
        </p>
      </div>

      {/* ── Planning Form ── */}
      <div className="border border-stone-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-stone-800 mb-5">New Demand Plan</h2>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Row 1: Finished Good + Target Quantity ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Finished Good dropdown */}
            <div>
              <label htmlFor="finishedGoodId" className="block text-sm font-medium text-stone-700 mb-1">
                Finished Good <span className="text-rose-500">*</span>
              </label>
              <select
                id="finishedGoodId"
                name="finishedGoodId"
                value={formData.finishedGoodId}
                onChange={handleFinishedGoodSelect}
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              >
                <option value="">Select a finished good</option>
                {finishedGoods.map((fg) => (
                  <option key={fg.id} value={fg.id}>{fg.name}</option>
                ))}
              </select>

              {/* Stock + recipe info — appears after a finished good is selected */}
              {selectedGood && (
                <p className="text-xs text-stone-500 mt-1.5">
                  In stock:{" "}
                  <span className="font-medium text-stone-700">
                    {currentStock} {selectedGood.unit}
                  </span>
                  {selectedRecipe ? (
                    <>
                      {" "}·{" "}
                      Recipe:{" "}
                      <span className="font-medium text-stone-700">
                        {selectedRecipe.name}
                      </span>{" "}
                      <span className="text-stone-400">
                        ({recipeYield} {selectedRecipe.yieldUnit}/batch)
                      </span>
                    </>
                  ) : (
                    <span className="text-rose-500"> · No active recipe found</span>
                  )}
                </p>
              )}
            </div>

            {/* Target Quantity */}
            <div>
              <label htmlFor="targetQuantity" className="block text-sm font-medium text-stone-700 mb-1">
                Target Quantity <span className="text-rose-500">*</span>
              </label>
              <input
                id="targetQuantity"
                name="targetQuantity"
                type="number"
                min="1"
                step="1"
                value={formData.targetQuantity}
                onChange={handleChange}
                placeholder="0"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

          </div>

          {/* ── Calculation strip ── */}
          {/* Only rendered when a finished good is selected AND a target quantity
              has been entered. Shows the four key numbers in one readable line.
              These values recalculate instantly on every keystroke because they
              are derived directly from formData — no useEffect needed. */}
          {selectedGood && formData.targetQuantity && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm flex flex-wrap gap-x-1 gap-y-1 items-center">
              <span className="font-medium text-stone-700">Target:</span>
              <span className="text-stone-800">{targetQty}</span>
              <span className="mx-2 text-stone-400">|</span>

              <span className="font-medium text-stone-700">In Stock:</span>
              <span className="text-stone-800">{currentStock ?? "—"}</span>
              <span className="mx-2 text-stone-400">|</span>

              <span className="font-medium text-stone-700">Shortfall:</span>
              <span className={shortfall > 0 ? "text-rose-600 font-semibold" : "text-stone-800"}>
                {shortfall}
              </span>
              <span className="mx-2 text-stone-400">|</span>

              <span className="font-medium text-stone-700">Batches needed:</span>
              <span className="font-semibold text-stone-800">
                {batchesRequired !== null
                  ? batchesRequired
                  : <span className="text-stone-400 font-normal">— <span className="text-xs">(no recipe)</span></span>
                }
              </span>
            </div>
          )}

          {/* ── Row 2: Required By + Notes ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Required By */}
            <div>
              <label htmlFor="requiredBy" className="block text-sm font-medium text-stone-700 mb-1">
                Required By <span className="text-rose-500">*</span>
              </label>
              <input
                id="requiredBy"
                name="requiredBy"
                type="date"
                value={formData.requiredBy}
                onChange={handleChange}
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-stone-700 mb-1">
                Notes{" "}
                <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <input
                id="notes"
                name="notes"
                type="text"
                value={formData.notes}
                onChange={handleChange}
                placeholder="e.g. Weekend market order"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
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
            {submitting ? "Creating..." : "Create Demand Plan"}
          </button>

        </form>
      </div>

      {/* ── Demand Plans Table ── */}
      <div>

        {/* Table header + show-all toggle */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-stone-800">
            Demand Plans
            {!showAll && (
              <span className="ml-2 text-sm font-normal text-stone-400">
                (open only)
              </span>
            )}
          </h2>
          <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="rounded border-stone-300 text-amber-500 focus:ring-amber-400"
            />
            Show cancelled
          </label>
        </div>

        {visiblePlans.length === 0 ? (
          <p className="text-stone-500 text-sm">
            {showAll
              ? "No demand plans yet. Create one above."
              : "No open demand plans. Create one above."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full text-sm text-left">

              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Finished Good</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Target</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">In Stock</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Shortfall</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Batches</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Required By</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100 bg-white">
                {visiblePlans.map((plan) => {
                  const isCancelled  = plan.status === "cancelled";
                  const isCancelling = cancellingId === plan.id;

                  return (
                    <tr
                      key={plan.id}
                      className={isCancelled ? "opacity-50" : ""}
                    >
                      {/* Finished Good name — strikethrough when cancelled */}
                      <td className={`px-4 py-3 font-medium ${isCancelled ? "text-stone-400 line-through" : "text-stone-800"}`}>
                        {plan.finishedGoodName}
                      </td>

                      <td className="px-4 py-3 text-stone-600">{plan.targetQuantity}</td>
                      <td className="px-4 py-3 text-stone-600">{plan.currentStock}</td>

                      {/* Shortfall in rose when non-zero and not cancelled */}
                      <td className={`px-4 py-3 font-medium ${plan.shortfall > 0 && !isCancelled ? "text-rose-600" : "text-stone-600"}`}>
                        {plan.shortfall}
                      </td>

                      <td className="px-4 py-3 text-stone-600">{plan.batchesRequired}</td>
                      <td className="px-4 py-3 text-stone-600">{formatDate(plan.requiredBy)}</td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          isCancelled
                            ? "bg-stone-100 text-stone-500"
                            : plan.status === "fulfilled"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-800"
                        }`}>
                          {plan.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">

                          {/* Create Work Order — only available on open plans.
                              Fulfilled plans already have a work order; the status
                              badge makes that clear so no button is needed. */}
                          {plan.status === "open" && (
                            <button
                              onClick={() => handleCreateWorkOrder(plan)}
                              disabled={creatingWorkOrderForId !== null}
                              className="text-sm font-medium text-amber-600 hover:text-amber-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {creatingWorkOrderForId === plan.id
                                ? "Creating..."
                                : "Work Order"}
                            </button>
                          )}

                          {/* Cancel — only shown on open plans */}
                          {!isCancelled && (
                            <button
                              onClick={() => handleCancel(plan.id, plan.finishedGoodName)}
                              disabled={isCancelling}
                              className="text-sm font-medium text-rose-500 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {isCancelling ? "Cancelling..." : "Cancel"}
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}

      </div>

    </div>
  );
}
