// Client Component — uses hooks throughout.
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getIngredients,
  getWorkOrders,
  getPurchaseOrders,
  addPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  receivePurchaseOrder,
} from "@/lib/firestore";

// ─── Helper functions (outside component — no state dependency) ───────────────

// Shared Tailwind classes for all text inputs on this page.
const inputCls =
  "w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent";

// Returns the Tailwind badge classes for a given PO status.
const getStatusBadgeClass = (status) => {
  switch (status) {
    case "draft":    return "bg-stone-100 text-stone-600";
    case "sent":     return "bg-blue-100 text-blue-700";
    case "partial":  return "bg-amber-100 text-amber-800";
    case "complete": return "bg-green-100 text-green-700";
    default:         return "bg-stone-100 text-stone-500";
  }
};

// Converts a "YYYY-MM-DD" date string to "MM/DD/YYYY" for display.
const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  return `${month}/${day}/${year}`;
};

// Converts a Firestore Timestamp to a short readable date: "Feb 26, 2026".
// Firestore Timestamps have a .toDate() method that returns a JS Date.
const formatTimestamp = (ts) => {
  if (!ts) return "—";
  return ts.toDate().toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
    year:  "numeric",
  });
};

// Aggregates ingredient consumption across all work orders in the filtered list.
// Uses a dictionary keyed by ingredientId to sum quantities, then cross-references
// current stock data to produce net requirement per ingredient.
//
// The dictionary pattern (plain object accumulator) is used instead of reduce()
// for readability: we loop over work orders, loop over each order's ingredientsRequired,
// and either create a new entry or add to the running total for that ingredientId.
//
// Returns an array sorted alphabetically by ingredient name.
const aggregateRequirements = (workOrders, ingredients) => {
  const totals = {};

  for (const wo of workOrders) {
    // batchesActual is authoritative when > 0 (order has started or is planned with
    // a manual adjustment). Fall back to batchesOrdered for orders not yet started.
    const batches = wo.batchesActual > 0 ? wo.batchesActual : wo.batchesOrdered;

    for (const ing of (wo.ingredientsRequired || [])) {
      if (totals[ing.ingredientId]) {
        totals[ing.ingredientId].totalRequired += ing.quantity * batches;
      } else {
        totals[ing.ingredientId] = {
          ingredientId:   ing.ingredientId,
          ingredientName: ing.ingredientName,
          unit:           ing.unit,
          totalRequired:  ing.quantity * batches,
        };
      }
    }
  }

  // Cross-reference live stock data and calculate net requirement.
  return Object.values(totals)
    .map((item) => {
      const stockItem   = ingredients.find((i) => i.id === item.ingredientId);
      const currentStock = stockItem?.currentStock      ?? 0;
      const safetyStock  = stockItem?.lowStockThreshold ?? 0;
      // available = what we actually have minus the safety buffer we must not dip below.
      // Can be negative if stock is already below threshold — that means we're already short.
      const available   = currentStock - safetyStock;
      // netRequired = how much we need to order. Floored at 0 (can't order negative).
      const netRequired = Math.max(0, item.totalRequired - available);
      return { ...item, currentStock, safetyStock, available, netRequired };
    })
    .sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function PurchasingPage() {
  const { user } = useAuth();

  // ── Page-level data ───────────────────────────────────────────────────────
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loadingPage,    setLoadingPage]    = useState(true);

  // ── Section 1: Requirements Calculator ───────────────────────────────────
  const [dateRange,           setDateRange]           = useState({ startDate: "", endDate: "" });
  // requirements: null = not yet calculated; array = results are ready to display.
  const [requirements,        setRequirements]        = useState(null);
  // workOrdersIncluded: IDs of WOs that fed the last calculation (stored in the PO).
  const [workOrdersIncluded,  setWorkOrdersIncluded]  = useState([]);
  // editedQty: user overrides for the "Net to Order" column, keyed by ingredientId.
  const [editedQty,           setEditedQty]           = useState({});
  const [calculating,         setCalculating]         = useState(false);
  const [calcError,           setCalcError]           = useState(null);
  const [creatingPo,          setCreatingPo]          = useState(false);

  // ── Section 2: Purchase Orders ────────────────────────────────────────────
  // expandedPoId: which PO's line-item panel is open (null = all collapsed).
  const [expandedPoId,   setExpandedPoId]   = useState(null);
  const [markingSentId,  setMarkingSentId]  = useState(null);
  const [deletingId,     setDeletingId]     = useState(null);

  // ── Section 3: Receive Goods ──────────────────────────────────────────────
  // receivingPo: the full PO object being received, or null when form is closed.
  const [receivingPo,       setReceivingPo]       = useState(null);
  // receivedQty: editable received quantities, keyed by ingredientId.
  const [receivedQty,       setReceivedQty]       = useState({});
  const [submittingReceive, setSubmittingReceive] = useState(false);
  const [receiveError,      setReceiveError]      = useState(null);

  // ── Initial data fetch ────────────────────────────────────────────────────
  // Only purchase orders are loaded on page mount. Work orders and ingredients
  // are fetched on-demand when the user clicks "Calculate Requirements" so we
  // don't slow down the initial page load with data the user may not need.
  useEffect(() => {
    const loadPOs = async () => {
      try {
        const data = await getPurchaseOrders();
        setPurchaseOrders(data);
      } catch (err) {
        console.error("Failed to load purchase orders:", err);
      } finally {
        setLoadingPage(false);
      }
    };
    loadPOs();
  }, []);

  // ── Derived value ─────────────────────────────────────────────────────────
  // The "Create Purchase Order" button is only active when at least one edited
  // quantity is greater than zero — i.e., there's something to actually order.
  const hasAnyOrderQty =
    requirements !== null &&
    Object.values(editedQty).some((v) => parseFloat(v) > 0);

  // ── Section 1 handlers ────────────────────────────────────────────────────

  // Updates startDate or endDate in the dateRange form object.
  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange((prev) => ({ ...prev, [name]: value }));
  };

  // Fetches work orders and ingredients, filters WOs to the date range,
  // aggregates ingredient totals, and updates the requirements table.
  const handleCalculate = async () => {
    if (!dateRange.startDate || !dateRange.endDate) {
      setCalcError("Please set both a start date and an end date.");
      return;
    }
    if (dateRange.startDate > dateRange.endDate) {
      setCalcError("Start date must be before or equal to end date.");
      return;
    }

    setCalcError(null);
    setCalculating(true);
    setRequirements(null);

    try {
      // Fetch work orders and ingredients in parallel.
      const [allWorkOrders, allIngredients] = await Promise.all([
        getWorkOrders(),
        getIngredients(),
      ]);

      // Filter to work orders within the date range whose scheduledStart falls
      // within [startDate, endDate]. scheduledStart is "YYYY-MM-DDThh:mm" — slicing
      // the first 10 chars gives "YYYY-MM-DD" for a clean string comparison.
      // Cancelled orders are excluded — they won't run, so we shouldn't buy for them.
      const startBound = dateRange.startDate;
      const endBound   = dateRange.endDate + "T23:59";
      const inRange = allWorkOrders.filter(
        (wo) =>
          wo.status !== "cancelled" &&
          wo.scheduledStart >= startBound &&
          wo.scheduledStart <= endBound
      );

      if (inRange.length === 0) {
        setCalcError(
          "No active work orders found in that date range. Schedule work orders on the Work Orders page first."
        );
        setCalculating(false);
        return;
      }

      const reqs = aggregateRequirements(inRange, allIngredients);

      // Initialise editedQty to the calculated net requirement for each ingredient.
      // The user can then adjust individual values before creating the PO.
      const initialEdits = {};
      reqs.forEach((r) => {
        initialEdits[r.ingredientId] = String(r.netRequired);
      });

      setRequirements(reqs);
      setEditedQty(initialEdits);
      setWorkOrdersIncluded(inRange.map((wo) => wo.id));
    } catch (err) {
      console.error("Failed to calculate requirements:", err);
      setCalcError("Failed to load data. Please try again.");
    } finally {
      setCalculating(false);
    }
  };

  // Updates a single "Net to Order" cell when the user edits it.
  const handleQtyChange = (ingredientId, value) => {
    setEditedQty((prev) => ({ ...prev, [ingredientId]: value }));
  };

  // Builds the PO items array from the requirements, substituting the user's
  // edited quantities for "orderedQuantity", then writes the PO to Firestore.
  const handleCreatePo = async () => {
    const items = requirements.map((r) => ({
      ingredientId:     r.ingredientId,
      ingredientName:   r.ingredientName,
      unit:             r.unit,
      currentStock:     r.currentStock,
      safetyStock:      r.safetyStock,
      totalRequired:    r.totalRequired,
      netRequired:      r.netRequired,
      orderedQuantity:  parseFloat(editedQty[r.ingredientId]) || 0,
      receivedQuantity: 0,    // filled in during goods receipt
    }));

    // Only include line items the user actually wants to order.
    const orderItems = items.filter((it) => it.orderedQuantity > 0);

    if (orderItems.length === 0) {
      setCalcError("Adjust quantities — all items are set to 0.");
      return;
    }

    setCreatingPo(true);
    try {
      await addPurchaseOrder({
        planningDateRange: {
          startDate: dateRange.startDate,
          endDate:   dateRange.endDate,
        },
        items:               orderItems,
        workOrdersIncluded:  workOrdersIncluded,
        notes:               "",
        createdBy:           user?.email ?? "",
      });

      // Re-fetch the PO list so the new draft appears immediately.
      const updated = await getPurchaseOrders();
      setPurchaseOrders(updated);

      // Clear the calculator so the user starts fresh for the next run.
      setRequirements(null);
      setEditedQty({});
      setWorkOrdersIncluded([]);
    } catch (err) {
      console.error("Failed to create purchase order:", err);
      setCalcError("Failed to create purchase order. Please try again.");
    } finally {
      setCreatingPo(false);
    }
  };

  // ── Section 2 handlers ────────────────────────────────────────────────────

  // Toggles the expanded line-item panel for a PO row.
  const handleToggleExpand = (id) => {
    setExpandedPoId((prev) => (prev === id ? null : id));
  };

  // Marks a draft PO as sent (status: "sent"). sentAt is set by firestore.js.
  const handleMarkSent = async (id) => {
    setMarkingSentId(id);
    try {
      await updatePurchaseOrder(id, { status: "sent" });
      const updated = await getPurchaseOrders();
      setPurchaseOrders(updated);
    } catch (err) {
      console.error("Failed to mark PO as sent:", err);
      window.alert("Failed to update purchase order. Please try again.");
    } finally {
      setMarkingSentId(null);
    }
  };

  // Deletes a draft PO after confirmation. The firestore function enforces
  // that only draft POs may be deleted.
  const handleDelete = async (po) => {
    const confirmed = window.confirm(
      `Delete draft purchase order from ${formatDate(po.planningDateRange?.startDate)}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingId(po.id);
    try {
      await deletePurchaseOrder(po.id, po.status);
      const updated = await getPurchaseOrders();
      setPurchaseOrders(updated);
    } catch (err) {
      console.error("Failed to delete purchase order:", err);
      window.alert("Failed to delete purchase order. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  // Opens the receive goods form pre-filled with the PO's ordered quantities.
  const handleOpenReceive = (po) => {
    const initial = {};
    po.items.forEach((item) => {
      // Pre-fill with the already-received amount if re-opening a partial PO,
      // otherwise default to the full ordered quantity.
      initial[item.ingredientId] = String(
        item.receivedQuantity > 0 ? item.receivedQuantity : item.orderedQuantity
      );
    });
    setReceivingPo(po);
    setReceivedQty(initial);
    setReceiveError(null);
    // Scroll to the form after the next paint so it's in view.
    setTimeout(() => {
      document.getElementById("receive-form")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const handleCloseReceive = () => {
    setReceivingPo(null);
    setReceivedQty({});
    setReceiveError(null);
  };

  // ── Section 3 handlers ────────────────────────────────────────────────────

  // Updates a single received-quantity field.
  const handleReceivedQtyChange = (ingredientId, value) => {
    setReceivedQty((prev) => ({ ...prev, [ingredientId]: value }));
  };

  // Builds the full updated items array (with receivedQuantity filled in) and
  // calls the atomic batch write in firestore.js.
  const handleSubmitReceive = async () => {
    const updatedItems = receivingPo.items.map((item) => ({
      ...item,
      receivedQuantity: parseFloat(receivedQty[item.ingredientId]) || 0,
    }));

    setSubmittingReceive(true);
    setReceiveError(null);
    try {
      await receivePurchaseOrder(
        receivingPo.id,
        updatedItems,
        user?.email ?? ""
      );
      const updated = await getPurchaseOrders();
      setPurchaseOrders(updated);
      handleCloseReceive();
    } catch (err) {
      console.error("Failed to receive goods:", err);
      setReceiveError("Failed to record receipt. Please try again.");
    } finally {
      setSubmittingReceive(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loadingPage) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading purchasing...</p>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-12">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">Purchasing</h1>
        <p className="text-sm text-stone-500 mt-1">
          Calculate ingredient requirements from scheduled work orders and manage purchase orders.
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — REQUIREMENTS CALCULATOR
          ══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-base font-semibold text-stone-800 mb-4">
          Requirements Calculator
        </h2>

        {/* Date range inputs + Calculate button */}
        <div className="border border-stone-200 rounded-lg p-5 space-y-4">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="startDate" className="block text-sm font-medium text-stone-700 mb-1">
                Start Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="startDate"
                name="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={handleDateChange}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="endDate" className="block text-sm font-medium text-stone-700 mb-1">
                End Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="endDate"
                name="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={handleDateChange}
                className={inputCls}
              />
            </div>
          </div>

          {calcError && (
            <p className="text-sm text-rose-600">{calcError}</p>
          )}

          <button
            onClick={handleCalculate}
            disabled={calculating}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {calculating ? "Calculating..." : "Calculate Requirements"}
          </button>
        </div>

        {/* Requirements table — rendered after a successful calculation */}
        {requirements !== null && (
          <div className="mt-6 space-y-4">

            {/* Context line: how many work orders fed this calculation */}
            <p className="text-sm text-stone-500">
              Based on{" "}
              <span className="font-medium text-stone-700">{workOrdersIncluded.length}</span>{" "}
              work order{workOrdersIncluded.length !== 1 ? "s" : ""} scheduled between{" "}
              <span className="font-medium text-stone-700">{formatDate(dateRange.startDate)}</span> and{" "}
              <span className="font-medium text-stone-700">{formatDate(dateRange.endDate)}</span>.
              {" "}Adjust the <em>Net to Order</em> quantities before creating the purchase order.
            </p>

            <div className="overflow-x-auto rounded-lg border border-stone-200">
              <table className="w-full text-sm text-left">

                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Ingredient</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Unit</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Currently Have</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Safety Stock</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Total Required</th>
                    <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Net to Order</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-stone-100 bg-white">
                  {requirements.map((row) => {
                    const needsOrder = row.netRequired > 0;
                    return (
                      <tr
                        key={row.ingredientId}
                        className={needsOrder ? "bg-amber-50" : "opacity-60"}
                      >
                        {/* Ingredient name — bold when action is needed */}
                        <td className={`px-4 py-3 ${needsOrder ? "font-medium text-stone-800" : "text-stone-500"}`}>
                          {row.ingredientName}
                        </td>

                        <td className="px-4 py-3 text-stone-600">{row.unit}</td>
                        <td className="px-4 py-3 text-stone-600">{row.currentStock}</td>

                        {/* Safety stock — shown in amber when stock is below threshold */}
                        <td className={`px-4 py-3 ${row.currentStock < row.safetyStock ? "text-rose-600 font-medium" : "text-stone-600"}`}>
                          {row.safetyStock}
                        </td>

                        <td className="px-4 py-3 text-stone-600">{row.totalRequired}</td>

                        {/* Net to Order — editable number input.
                            Initialized to the calculated netRequired; owner can adjust. */}
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editedQty[row.ingredientId] ?? ""}
                            onChange={(e) => handleQtyChange(row.ingredientId, e.target.value)}
                            className={`w-24 rounded-md border px-2 py-1 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent ${
                              needsOrder
                                ? "border-amber-300 bg-white"
                                : "border-stone-200 bg-stone-50"
                            }`}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

              </table>
            </div>

            {/* Create PO button */}
            <div className="flex items-center gap-4">
              <button
                onClick={handleCreatePo}
                disabled={!hasAnyOrderQty || creatingPo}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {creatingPo ? "Creating..." : "Create Purchase Order"}
              </button>
              {!hasAnyOrderQty && (
                <p className="text-xs text-stone-400">
                  Set at least one quantity above 0 to create an order.
                </p>
              )}
            </div>

          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — PURCHASE ORDERS LIST
          ══════════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-base font-semibold text-stone-800 mb-4">Purchase Orders</h2>

        {purchaseOrders.length === 0 ? (
          <p className="text-stone-500 text-sm">
            No purchase orders yet. Use the calculator above to create one.
          </p>
        ) : (
          <div className="space-y-3">
            {purchaseOrders.map((po) => {
              const isExpanded    = expandedPoId === po.id;
              const isMarkingSent = markingSentId === po.id;
              const isDeleting    = deletingId === po.id;

              return (
                <div
                  key={po.id}
                  className="rounded-lg border border-stone-200 bg-white overflow-hidden"
                >
                  {/* ── PO row (always visible) ── */}
                  <div className="flex items-center justify-between px-4 py-3 gap-4 flex-wrap">

                    {/* Left: date + range + item count */}
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-stone-800">
                          Created {formatTimestamp(po.createdAt)}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClass(po.status)}`}>
                          {po.status}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500">
                        Covers{" "}
                        {formatDate(po.planningDateRange?.startDate)}
                        {" – "}
                        {formatDate(po.planningDateRange?.endDate)}
                        {" · "}
                        {po.items?.length ?? 0} line item{(po.items?.length ?? 0) !== 1 ? "s" : ""}
                        {" · "}
                        {po.workOrdersIncluded?.length ?? 0} work order{(po.workOrdersIncluded?.length ?? 0) !== 1 ? "s" : ""}
                      </p>
                    </div>

                    {/* Right: actions + expand toggle */}
                    <div className="flex items-center gap-3 flex-wrap shrink-0">

                      {/* Draft actions */}
                      {po.status === "draft" && (
                        <>
                          <button
                            onClick={() => handleMarkSent(po.id)}
                            disabled={isMarkingSent || isDeleting}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isMarkingSent ? "Updating..." : "Mark as Sent"}
                          </button>
                          <button
                            onClick={() => handleDelete(po)}
                            disabled={isMarkingSent || isDeleting}
                            className="text-sm font-medium text-rose-500 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isDeleting ? "Deleting..." : "Delete"}
                          </button>
                        </>
                      )}

                      {/* Sent action */}
                      {po.status === "sent" && (
                        <button
                          onClick={() => handleOpenReceive(po)}
                          className="text-sm font-medium text-green-600 hover:text-green-800"
                        >
                          Receive Goods
                        </button>
                      )}

                      {/* Expand/collapse line items */}
                      <button
                        onClick={() => handleToggleExpand(po.id)}
                        className="text-sm font-medium text-stone-500 hover:text-stone-800"
                        aria-label={isExpanded ? "Collapse details" : "Expand details"}
                      >
                        {isExpanded ? "Hide ▲" : "Details ▼"}
                      </button>

                    </div>
                  </div>

                  {/* ── Expandable line items panel ── */}
                  {isExpanded && (
                    <div className="border-t border-stone-100">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-stone-50">
                          <tr>
                            <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Ingredient</th>
                            <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Ordered</th>
                            <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Received</th>
                            <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Unit</th>
                            <th className="px-4 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {(po.items ?? []).map((item) => {
                            // Determine line-item receipt status for completed/partial POs.
                            const isPending  = po.status === "draft" || po.status === "sent";
                            const isReceived = !isPending && item.receivedQuantity >= item.orderedQuantity;
                            const isShort    = !isPending && !isReceived && item.receivedQuantity > 0;
                            const isMissing  = !isPending && item.receivedQuantity === 0;

                            return (
                              <tr key={item.ingredientId}>
                                <td className="px-4 py-2.5 font-medium text-stone-700">{item.ingredientName}</td>
                                <td className="px-4 py-2.5 text-stone-600">{item.orderedQuantity}</td>
                                <td className="px-4 py-2.5 text-stone-600">
                                  {isPending ? "—" : item.receivedQuantity}
                                </td>
                                <td className="px-4 py-2.5 text-stone-600">{item.unit}</td>
                                <td className="px-4 py-2.5">
                                  {isPending  && <span className="text-xs text-stone-400">Pending</span>}
                                  {isReceived && <span className="text-xs font-medium text-green-700">Received</span>}
                                  {isShort    && <span className="text-xs font-medium text-amber-700">Short</span>}
                                  {isMissing  && <span className="text-xs font-medium text-rose-600">Not received</span>}
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
            })}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 3 — RECEIVE GOODS FORM
          Only rendered when the user clicks "Receive Goods" on a sent PO.
          ══════════════════════════════════════════════════════════════════════ */}
      {receivingPo && (
        <section id="receive-form" className="border-t border-stone-200 pt-8">

          {/* Form header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-stone-800">Receive Goods</h2>
              <p className="text-sm text-stone-500 mt-0.5">
                Enter the quantity received for each line item.
                Items received in full are marked complete; any short delivery marks
                the order as partial.
              </p>
            </div>
            <button
              onClick={handleCloseReceive}
              className="text-sm text-stone-500 hover:text-stone-800 shrink-0"
            >
              Cancel
            </button>
          </div>

          {/* PO context */}
          <div className="rounded-md bg-stone-50 border border-stone-200 px-4 py-3 text-sm text-stone-600 mb-5">
            Purchase order from{" "}
            <span className="font-medium text-stone-800">{formatTimestamp(receivingPo.createdAt)}</span>
            {" · "}Covers{" "}
            {formatDate(receivingPo.planningDateRange?.startDate)}
            {" – "}
            {formatDate(receivingPo.planningDateRange?.endDate)}
          </div>

          {/* Line items */}
          <div className="rounded-lg border border-stone-200 divide-y divide-stone-100 overflow-hidden mb-5">
            {receivingPo.items.map((item) => {
              const received    = parseFloat(receivedQty[item.ingredientId]) || 0;
              const isShortLine = received < item.orderedQuantity;

              return (
                <div
                  key={item.ingredientId}
                  className={`flex items-center justify-between px-4 py-3 gap-4 flex-wrap ${
                    isShortLine ? "bg-amber-50" : "bg-white"
                  }`}
                >
                  {/* Ingredient name + ordered qty */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-800">{item.ingredientName}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Ordered: {item.orderedQuantity} {item.unit}
                    </p>
                  </div>

                  {/* Received qty input + partial label */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isShortLine && received >= 0 && (
                      <span className="text-xs font-medium text-amber-700">partial</span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={receivedQty[item.ingredientId] ?? ""}
                        onChange={(e) =>
                          handleReceivedQtyChange(item.ingredientId, e.target.value)
                        }
                        className="w-24 rounded-md border border-stone-300 px-2 py-1.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                      />
                      <span className="text-xs text-stone-500">{item.unit}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {receiveError && (
            <p className="text-sm text-rose-600 mb-4">{receiveError}</p>
          )}

          <button
            onClick={handleSubmitReceive}
            disabled={submittingReceive}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submittingReceive ? "Recording..." : "Record Receipt"}
          </button>

        </section>
      )}

    </div>
  );
}
