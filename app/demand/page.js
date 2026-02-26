// Client Component — uses hooks throughout.
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  getIngredients,
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
  customerName:    "",
  customerContact: "",
  pickupDateTime:  "",
  paymentNotes:    "",
  finishedGoodId:  "",
  targetQuantity:  "",
  notes:           "",
});

// The main Special Orders page.
// Shows a new-order form at the top and a table of MTO customer orders below.
export default function DemandPage() {
  const { user }   = useAuth();
  const router     = useRouter();

  // ─── Fetched data ────────────────────────────────────────────────────────
  const [demandPlans,   setDemandPlans]   = useState([]);
  const [finishedGoods, setFinishedGoods] = useState([]);
  const [recipes,       setRecipes]       = useState([]);
  const [ingredients,   setIngredients]   = useState([]);
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
  // All calculated values (batchesRequired, ingredientCheck, etc.) are derived below.
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
  const recipeYield    = selectedRecipe?.yieldQuantity ?? null;

  // Parse the target quantity input string to a number.
  // parseFloat("") returns NaN, so we fall back to 0 with the || operator.
  const targetQty = parseFloat(formData.targetQuantity) || 0;

  // batchesRequired: how many full batches needed to fill this order from scratch.
  // MTO never offsets against shelf stock — we produce the full quantity every time.
  // null means "can't calculate" (no recipe found for this finished good).
  const batchesRequired = !recipeYield
    ? null
    : Math.ceil(targetQty / recipeYield);

  // totalYield: the actual units the recipe will produce across all batches.
  // Because we always ceil batchesRequired, totalYield ≥ targetQty.
  const totalYield = (batchesRequired ?? 0) * (recipeYield ?? 0);

  // ingredientCheck: per-ingredient sufficiency check for the calculated batch count.
  // Same derived-variable pattern used in the work-orders create form — recomputes
  // on every render whenever targetQty or finishedGoodId changes.
  // Empty array when no recipe is selected yet.
  const ingredientCheck = !selectedRecipe ? [] : selectedRecipe.ingredients.map((ing) => {
    const stockItem     = ingredients.find((i) => i.id === ing.ingredientId);
    const stock         = stockItem?.currentStock ?? 0;
    const totalRequired = (batchesRequired ?? 0) * ing.quantity;
    const sufficient    = stock >= totalRequired;
    return {
      ...ing,
      stock,
      totalRequired,
      sufficient,
      shortfall: sufficient ? 0 : totalRequired - stock,
    };
  });

  // True only when there is at least one ingredient and every one is covered.
  const allIngredientsSufficient =
    ingredientCheck.length > 0 && ingredientCheck.every((ic) => ic.sufficient);

  // ─── Initial data fetch ──────────────────────────────────────────────────
  // Fetch all four collections in parallel. Promise.all means we fire all
  // requests at once instead of waiting for each one to finish — roughly 4×
  // faster on a cold load. Ingredients are needed for the real-time stock check.
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [plansData, goodsData, recipesData, ingredientsData] = await Promise.all([
          getDemandPlans(),
          getFinishedGoods(),
          getRecipes(),
          getIngredients(),
        ]);
        setDemandPlans(plansData);
        setFinishedGoods(goodsData);
        setRecipes(recipesData);
        setIngredients(ingredientsData);
      } catch (err) {
        console.error("Failed to load special orders data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // ─── Form handlers ───────────────────────────────────────────────────────

  // Generic handler for all plain text/number/datetime inputs.
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
    if (!formData.customerName.trim()) {
      setError("Customer name is required.");
      return;
    }
    if (!formData.finishedGoodId) {
      setError("Please select a finished good.");
      return;
    }
    if (!formData.targetQuantity || parseFloat(formData.targetQuantity) <= 0) {
      setError("Target quantity must be greater than 0.");
      return;
    }
    if (!formData.pickupDateTime) {
      setError("Please set a pickup date and time.");
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
    // Customer fields and orderType are added here for MTO orders.
    const planData = {
      orderType:        "MTO",
      customerName:     formData.customerName.trim(),
      customerContact:  formData.customerContact.trim(),
      pickupDateTime:   formData.pickupDateTime,   // stored as "YYYY-MM-DDThh:mm" string
      paymentNotes:     formData.paymentNotes.trim(),
      finishedGoodId:   formData.finishedGoodId,
      finishedGoodName: selectedGood.name,
      targetQuantity:   parseFloat(formData.targetQuantity),
      batchesRequired:  batchesRequired ?? 0,
      recipeId:         selectedRecipe.id,
      recipeName:       selectedRecipe.name,
      recipeYield:      recipeYield,
      status:           "open",
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
      `Cancel the special order for "${name}"? This cannot be undone.`
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

  // ─── Datetime formatting ──────────────────────────────────────────────────
  // Converts a "YYYY-MM-DDThh:mm" datetime-local string to a readable format:
  // "Feb 25, 9:00 AM". Uses the browser's local timezone (same as how the
  // value was entered), so no UTC conversion surprises.
  const formatPickup = (dtStr) => {
    if (!dtStr) return "—";
    return new Date(dtStr).toLocaleString("en-US", {
      month: "short",
      day:   "numeric",
      hour:  "numeric",
      minute: "2-digit",
    });
  };

  // ─── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading special orders...</p>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">Special Orders</h1>
        <p className="text-sm text-stone-500 mt-1">
          Make-to-order customer orders — record the customer, calculate batches, and create a work order.
        </p>
      </div>

      {/* ── New Special Order Form ── */}
      <div className="border border-stone-200 rounded-lg p-6">
        <h2 className="text-base font-semibold text-stone-800 mb-5">New Special Order</h2>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Section 1: Customer info ── */}
          {/* Customer name leads the form because MTO orders are organized by customer. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Customer Name */}
            <div>
              <label htmlFor="customerName" className="block text-sm font-medium text-stone-700 mb-1">
                Customer Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="customerName"
                name="customerName"
                type="text"
                value={formData.customerName}
                onChange={handleChange}
                placeholder="e.g. Jane Smith"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            {/* Customer Contact */}
            <div>
              <label htmlFor="customerContact" className="block text-sm font-medium text-stone-700 mb-1">
                Customer Contact{" "}
                <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <input
                id="customerContact"
                name="customerContact"
                type="text"
                value={formData.customerContact}
                onChange={handleChange}
                placeholder="Phone or email"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

          </div>

          {/* ── Row 2: Pickup Date/Time + Payment Notes ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Pickup Date & Time */}
            <div>
              <label htmlFor="pickupDateTime" className="block text-sm font-medium text-stone-700 mb-1">
                Pickup Date &amp; Time <span className="text-rose-500">*</span>
              </label>
              <input
                id="pickupDateTime"
                name="pickupDateTime"
                type="datetime-local"
                value={formData.pickupDateTime}
                onChange={handleChange}
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

            {/* Payment Notes */}
            <div>
              <label htmlFor="paymentNotes" className="block text-sm font-medium text-stone-700 mb-1">
                Payment Notes{" "}
                <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <input
                id="paymentNotes"
                name="paymentNotes"
                type="text"
                value={formData.paymentNotes}
                onChange={handleChange}
                placeholder="e.g. Deposit paid"
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>

          </div>

          {/* ── Divider between customer fields and product fields ── */}
          <div className="border-t border-stone-100" />

          {/* ── Row 3: Finished Good + Target Quantity ── */}
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

              {/* Recipe info — appears after a finished good is selected.
                  No "In stock" shown here because MTO always produces to order. */}
              {selectedGood && (
                <p className="text-xs text-stone-500 mt-1.5">
                  {selectedRecipe ? (
                    <>
                      Recipe:{" "}
                      <span className="font-medium text-stone-700">
                        {selectedRecipe.name}
                      </span>{" "}
                      <span className="text-stone-400">
                        ({recipeYield} {selectedRecipe.yieldUnit}/batch)
                      </span>
                    </>
                  ) : (
                    <span className="text-rose-500">No active recipe found</span>
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
          {/* Rendered when a finished good is selected and a target quantity entered.
              Shows Quantity, Batches needed, and Total yield — no shelf stock or
              shortfall, because MTO always produces to order from scratch.
              Values recalculate instantly on every keystroke (derived variables). */}
          {selectedGood && formData.targetQuantity && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm flex flex-wrap gap-x-1 gap-y-1 items-center">
              <span className="font-medium text-stone-700">Quantity:</span>
              <span className="text-stone-800">{targetQty}</span>
              <span className="mx-2 text-stone-400">|</span>

              <span className="font-medium text-stone-700">Batches needed:</span>
              <span className="font-semibold text-stone-800">
                {batchesRequired !== null
                  ? batchesRequired
                  : <span className="text-stone-400 font-normal">— <span className="text-xs">(no recipe)</span></span>
                }
              </span>
              <span className="mx-2 text-stone-400">|</span>

              <span className="font-medium text-stone-700">Total yield:</span>
              <span className="text-stone-800">
                {totalYield > 0
                  ? `${totalYield} ${selectedRecipe?.yieldUnit ?? ""}`
                  : "—"
                }
              </span>
            </div>
          )}

          {/* ── Ingredient availability check ── */}
          {/* Shown when a recipe is selected and a target quantity is entered.
              Updates in real time as targetQuantity changes — no useEffect needed
              because ingredientCheck is a derived variable, not stored state.
              Green row = sufficient stock. Rose row = short, shows shortfall. */}
          {selectedRecipe && batchesRequired !== null && batchesRequired > 0 && ingredientCheck.length > 0 && (
            <div>
              <p className="text-sm font-medium text-stone-700 mb-2">
                Ingredients Required
                <span className="ml-2 font-normal text-stone-400">
                  ({batchesRequired} batch{batchesRequired !== 1 ? "es" : ""})
                </span>
              </p>

              <div className="rounded-md border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                {ingredientCheck.map((ic) => (
                  <div
                    key={ic.ingredientId}
                    className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                      ic.sufficient ? "bg-white" : "bg-rose-50"
                    }`}
                  >
                    {/* Ingredient name + sufficiency indicator */}
                    <span className={`font-medium ${ic.sufficient ? "text-stone-700" : "text-rose-700"}`}>
                      {ic.sufficient ? "✓" : "✗"} {ic.ingredientName}
                    </span>

                    {/* Need / Have / Short */}
                    <span className="text-stone-500 text-xs text-right">
                      Need{" "}
                      <span className="font-medium text-stone-700">
                        {ic.totalRequired} {ic.unit}
                      </span>
                      {" "}·{" "}
                      Have{" "}
                      <span className={`font-medium ${ic.sufficient ? "text-stone-700" : "text-rose-600"}`}>
                        {ic.stock} {ic.unit}
                      </span>
                      {!ic.sufficient && (
                        <span className="text-rose-600 font-medium">
                          {" "}· Short {ic.shortfall} {ic.unit}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Summary line below the ingredient list */}
              <p className="text-xs font-medium mt-2">
                {allIngredientsSufficient ? (
                  <span className="text-green-700">✓ All ingredients available</span>
                ) : (
                  <span className="text-rose-600">
                    ⚠ Some ingredients are short — restock before creating a work order
                  </span>
                )}
              </p>
            </div>
          )}

          {/* ── Row 4: Order Notes ── */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-stone-700 mb-1">
              Order Notes{" "}
              <span className="text-stone-400 font-normal">(optional)</span>
            </label>
            <input
              id="notes"
              name="notes"
              type="text"
              value={formData.notes}
              onChange={handleChange}
              placeholder="e.g. Nut-free, gluten-free packaging requested"
              className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
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
            {submitting ? "Creating..." : "Create Special Order"}
          </button>

        </form>
      </div>

      {/* ── Special Orders Table ── */}
      <div>

        {/* Table header + show-all toggle */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-stone-800">
            Special Orders
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
              ? "No special orders yet. Create one above."
              : "No open special orders. Create one above."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full text-sm text-left">

              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Finished Good</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Qty</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Batches</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Pickup</th>
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
                      {/* Customer name — most prominent column, strikethrough when cancelled */}
                      <td className={`px-4 py-3 font-semibold ${isCancelled ? "text-stone-400 line-through" : "text-stone-800"}`}>
                        {plan.customerName || "—"}
                      </td>

                      <td className="px-4 py-3 text-stone-600">{plan.finishedGoodName}</td>
                      <td className="px-4 py-3 text-stone-600">{plan.targetQuantity}</td>
                      <td className="px-4 py-3 text-stone-600">{plan.batchesRequired}</td>
                      <td className="px-4 py-3 text-stone-600">{formatPickup(plan.pickupDateTime)}</td>

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
                              onClick={() => handleCancel(plan.id, plan.customerName || plan.finishedGoodName)}
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
