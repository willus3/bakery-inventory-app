// Client Component — uses hooks throughout.
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  getRecipes,
  getIngredients,
  getWorkOrders,
  addWorkOrder,
  updateWorkOrder,
  cancelWorkOrder,
  executeWorkOrder,
} from "@/lib/firestore";

// ─── Helper functions (outside component — no state dependency) ───────────────

const emptyCreateFormData = () => ({
  recipeId:       "",
  batchesOrdered: "",
  scheduledStart: "",
  dueBy:          "",
  notes:          "",
});

const emptyEditData = () => ({
  batchesActual:  "",
  scheduledStart: "",
  dueBy:          "",
  notes:          "",
});

// Returns today's date as "YYYY-MM-DD" using local time methods.
// We avoid toISOString() because it converts to UTC first — at 11 PM EST,
// toISOString() already returns the next calendar day, which would
// silently miscategorize work orders as "not today".
const getTodayStr = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
};

// Checks whether a datetime-local string ("YYYY-MM-DDThh:mm") falls on today.
// We slice the first 10 characters to get the date portion and compare.
const isToday = (dtStr) => {
  if (!dtStr) return false;
  return dtStr.slice(0, 10) === getTodayStr();
};

// A work order is overdue if its scheduled start has passed and it
// hasn't been completed or cancelled.
// datetime-local strings without a timezone suffix are parsed as LOCAL time
// in modern browsers, so comparing to `new Date()` (also local) is correct.
const isOverdue = (wo) => {
  if (!wo.scheduledStart) return false;
  if (wo.status === "complete" || wo.status === "cancelled") return false;
  return new Date(wo.scheduledStart) < new Date();
};

// Formats a datetime-local string to a readable short form: "Feb 25, 9:00 AM"
const formatDateTime = (dtStr) => {
  if (!dtStr) return "—";
  return new Date(dtStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// Returns the display label and Tailwind badge classes for a work order's status.
// Overdue takes precedence over "planned" since it's more urgent.
const getStatusInfo = (wo) => {
  if (isOverdue(wo)) return { label: "overdue",     badgeClass: "bg-rose-100 text-rose-700" };
  switch (wo.status) {
    case "planned":    return { label: "planned",     badgeClass: "bg-amber-100 text-amber-800" };
    case "inProgress": return { label: "in progress", badgeClass: "bg-blue-100 text-blue-700" };
    case "complete":   return { label: "complete",    badgeClass: "bg-green-100 text-green-700" };
    case "cancelled":  return { label: "cancelled",   badgeClass: "bg-stone-100 text-stone-500" };
    default:           return { label: wo.status,     badgeClass: "bg-stone-100 text-stone-500" };
  }
};

// Formats a Date object to "YYYY-MM-DD" using local time methods.
// Reuses the same approach as getTodayStr() so all date strings are consistent.
const dateToStr = (d) => [
  d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, "0"),
  String(d.getDate()).padStart(2, "0"),
].join("-");

// Returns the Monday of the week containing `date` as "YYYY-MM-DD".
// getDay() returns 0=Sun, 1=Mon...6=Sat. We subtract the right number of days
// to land on Monday, treating Sunday as the end of the previous week (ISO week).
const getMondayOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return dateToStr(d);
};

// Tab definitions for the All Work Orders section.
// "All" tab removed — "All Time" date preset serves the same purpose.
const TABS = [
  { key: "planned",    label: "Planned" },
  { key: "inProgress", label: "In Progress" },
  { key: "complete",   label: "Complete" },
  { key: "cancelled",  label: "Cancelled" },
];

// Date preset buttons shown above the status tabs.
const DATE_PRESETS = [
  { key: "today",     label: "Today" },
  { key: "thisWeek",  label: "This Week" },
  { key: "lastWeek",  label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "allTime",   label: "All Time" },
];

// Shared Tailwind classes for all text inputs and selects in the form.
const inputCls =
  "w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent";

// ─── Main component ───────────────────────────────────────────────────────────

export default function WorkOrdersPage() {
  const { user } = useAuth();

  // ── Fetched data ─────────────────────────────────────────────────────────
  const [workOrders,  setWorkOrders]  = useState([]);
  const [recipes,     setRecipes]     = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading,     setLoading]     = useState(true);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeTab,        setActiveTab]        = useState("planned");
  // Controls which date range preset is active. "allTime" = no date filter.
  const [datePreset,       setDatePreset]       = useState("allTime");
  const [showForm,         setShowForm]         = useState(false);
  // "create" | "edit" — controls which form is rendered in the form section
  const [formMode,         setFormMode]         = useState("create");
  const [editingId,        setEditingId]        = useState(null);
  // Stores the full work order being edited so we can display its locked fields
  const [editingWorkOrder, setEditingWorkOrder] = useState(null);
  const [submitting,       setSubmitting]       = useState(false);
  const [startingId,       setStartingId]       = useState(null);
  const [cancellingId,     setCancellingId]     = useState(null);
  const [completingId,     setCompletingId]     = useState(null);
  const [error,            setError]            = useState(null);
  // Shown as a green banner after a successful production execution.
  // Auto-dismissed after 6 seconds.
  const [successMessage,   setSuccessMessage]   = useState(null);

  // ── Form state ───────────────────────────────────────────────────────────
  const [formData, setFormData] = useState(emptyCreateFormData());
  const [editData, setEditData] = useState(emptyEditData());

  // ── Derived values from create form ─────────────────────────────────────
  // These are plain variables, not state. They recalculate every render from
  // formData + loaded data — no useEffect needed. When the user types a new
  // batch count, React re-renders, and ingredientCheck updates instantly.
  const selectedRecipe = recipes.find((r) => r.id === formData.recipeId) ?? null;
  const batchCount     = parseInt(formData.batchesOrdered) || 0;

  // For each ingredient in the recipe, calculate how much is needed in total
  // (batchCount × quantity per batch) and check against current stock.
  const ingredientCheck = !selectedRecipe ? [] : selectedRecipe.ingredients.map((ing) => {
    const stockItem     = ingredients.find((i) => i.id === ing.ingredientId);
    const currentStock  = stockItem?.currentStock ?? 0;
    const totalRequired = batchCount * ing.quantity;
    const sufficient    = currentStock >= totalRequired;
    return {
      ...ing,
      currentStock,
      totalRequired,
      sufficient,
      shortfall: sufficient ? 0 : totalRequired - currentStock,
    };
  });

  const allIngredientsSufficient =
    ingredientCheck.length > 0 && ingredientCheck.every((ic) => ic.sufficient);

  const totalYield = batchCount * (selectedRecipe?.yieldQuantity ?? 0);

  // ── Derived values from edit form ────────────────────────────────────────
  // Same pattern as the create-form check above, driven by editData.batchesActual.
  // editingWorkOrder.ingredientsRequired is a snapshot array with the same
  // shape as recipe.ingredients: { ingredientId, ingredientName, quantity, unit }.
  // We cross-reference the freshly fetched `ingredients` state for current stock.
  const editBatchCount = parseInt(editData.batchesActual) || 0;

  const editIngredientCheck = !editingWorkOrder ? [] : editingWorkOrder.ingredientsRequired.map((ing) => {
    const stockItem     = ingredients.find((i) => i.id === ing.ingredientId);
    const currentStock  = stockItem?.currentStock ?? 0;
    const totalRequired = editBatchCount * ing.quantity;
    const sufficient    = currentStock >= totalRequired;
    return {
      ...ing,
      currentStock,
      totalRequired,
      sufficient,
      shortfall: sufficient ? 0 : totalRequired - currentStock,
    };
  });

  const editAllSufficient =
    editIngredientCheck.length > 0 && editIngredientCheck.every((ic) => ic.sufficient);

  // ── Initial data fetch ───────────────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [ordersData, recipesData, ingredientsData] = await Promise.all([
          getWorkOrders(),
          getRecipes(),
          getIngredients(),
        ]);
        setWorkOrders(ordersData);
        setRecipes(recipesData);
        setIngredients(ingredientsData);
      } catch (err) {
        console.error("Failed to load work orders data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // Auto-dismiss the success banner after 6 seconds.
  // The cleanup function (return) cancels the timer if the component unmounts
  // or if successMessage changes before the 6 seconds are up — prevents a
  // setState call on an unmounted component.
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // ── Form open / close ────────────────────────────────────────────────────

  const handleNewWorkOrder = () => {
    setFormMode("create");
    setEditingId(null);
    setEditingWorkOrder(null);
    setFormData(emptyCreateFormData());
    setError(null);
    setShowForm(true);
    setTimeout(() => {
      document.getElementById("work-order-form")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setFormMode("create");
    setEditingId(null);
    setEditingWorkOrder(null);
    setFormData(emptyCreateFormData());
    setEditData(emptyEditData());
    setError(null);
  };

  // ── Create form handlers ─────────────────────────────────────────────────

  // Generic handler for batchesOrdered, scheduledStart, dueBy, notes.
  // Uses the input's `name` attribute to know which formData field to update.
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Recipe dropdown gets its own handler because selecting a recipe implicitly
  // drives which ingredient check list is shown — we store only the ID and
  // derive everything else.
  const handleRecipeSelect = (e) => {
    setFormData((prev) => ({ ...prev, recipeId: e.target.value }));
  };

  // ── Edit handlers ────────────────────────────────────────────────────────

  const handleEditStart = async (wo) => {
    setEditingId(wo.id);
    setEditingWorkOrder(wo);
    setEditData({
      batchesActual:  String(wo.batchesActual),
      scheduledStart: wo.scheduledStart,
      dueBy:          wo.dueBy,
      notes:          wo.notes ?? "",
    });
    setFormMode("edit");
    setError(null);
    setShowForm(true);

    // Refresh ingredient stock so the sufficiency check uses current numbers,
    // not the potentially stale data from the initial page load.
    // This is non-fatal — if it fails, the check still runs with cached data.
    try {
      const freshIngredients = await getIngredients();
      setIngredients(freshIngredients);
    } catch (err) {
      console.error("Failed to refresh ingredient stock for edit form:", err);
    }

    setTimeout(() => {
      document.getElementById("work-order-form")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditData((prev) => ({ ...prev, [name]: value }));
  };

  // ── Status action handlers ───────────────────────────────────────────────

  // Marks a work order as in-progress. No confirmation needed — non-destructive.
  const handleStart = async (id) => {
    setStartingId(id);
    try {
      await updateWorkOrder(id, { status: "inProgress" });
      const updated = await getWorkOrders();
      setWorkOrders(updated);
    } catch (err) {
      console.error("Failed to start work order:", err);
      window.alert("Failed to start work order. Please try again.");
    } finally {
      setStartingId(null);
    }
  };

  const handleCancelWorkOrder = async (id, name) => {
    const confirmed = window.confirm(
      `Cancel the work order for "${name}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setCancellingId(id);
    try {
      await cancelWorkOrder(id);
      const updated = await getWorkOrders();
      setWorkOrders(updated);
    } catch (err) {
      console.error("Failed to cancel work order:", err);
      window.alert("Failed to cancel work order. Please try again.");
    } finally {
      setCancellingId(null);
    }
  };

  // Executes a completed work order via a single atomic batch write that
  // deducts all ingredients, adds to finished good stock, marks the order
  // complete, and writes a production record — all or nothing.
  //
  // This function has three distinct failure modes, each handled separately:
  //   1. Ingredient fetch fails  → alert + return (nothing was changed)
  //   2. Stock insufficient      → alert + return (nothing was changed)
  //   3. batch.commit() fails    → alert + return (nothing was changed)
  //   4. getWorkOrders() fails after commit → success banner with "refresh" note
  const handleComplete = async (wo) => {
    setCompletingId(wo.id);
    setSuccessMessage(null);

    try {
      // ── Step 1: Fetch current ingredient stock ─────────────────────────────
      // The `ingredients` state may be hours old — another completed work order
      // or a restock could have changed stock levels since the page loaded.
      // We need fresh numbers before we can safely decide whether to proceed.
      let freshIngredients;
      try {
        freshIngredients = await getIngredients();
      } catch (fetchErr) {
        console.error("Failed to fetch ingredient stock:", fetchErr);
        window.alert("Failed to verify ingredient stock. Please try again.");
        return;
      }

      // ── Step 2: Verify stock for each ingredient ───────────────────────────
      // Use ing.quantity * wo.batchesActual — the correct amount for the actual
      // batch count, not the snapshotted ing.totalRequired which was calculated
      // from batchesOrdered at creation time.
      const stockCheck = wo.ingredientsRequired.map((ing) => {
        const currentStock   = freshIngredients.find((i) => i.id === ing.ingredientId)?.currentStock ?? 0;
        const actualRequired = ing.quantity * wo.batchesActual;
        const sufficient     = currentStock >= actualRequired;
        return { ...ing, currentStock, actualRequired, sufficient };
      });

      // ── Step 3: Block if any ingredient is short ───────────────────────────
      const shortIngredients = stockCheck.filter((ic) => !ic.sufficient);
      if (shortIngredients.length > 0) {
        const lines = shortIngredients
          .map((ic) => `  • ${ic.ingredientName}: have ${ic.currentStock} ${ic.unit}, need ${ic.actualRequired} ${ic.unit}`)
          .join("\n");
        window.alert(`Cannot complete — insufficient stock:\n\n${lines}`);
        return;
      }

      // ── Step 4: Confirm dialog with actual deduction amounts ───────────────
      // We show the fresh actual amounts (not the stale totalRequired snapshot)
      // so the baker knows exactly what will be deducted.
      const ingredientLines = stockCheck
        .map((ic) => `  • ${ic.actualRequired} ${ic.unit} ${ic.ingredientName}`)
        .join("\n");

      const confirmed = window.confirm(
        `Complete this work order?\n\n` +
        `Deducting from inventory:\n${ingredientLines}\n\n` +
        `Adding to inventory:\n  • ${wo.totalYield} ${wo.finishedGoodName}\n\n` +
        `This cannot be undone.`
      );
      if (!confirmed) return;

      // ── Step 5: Atomic batch write ─────────────────────────────────────────
      // If this throws, none of the 4 operations ran — safe to retry.
      await executeWorkOrder(wo, user?.email ?? "");

      // ── Step 6: Refresh the work order list ───────────────────────────────
      // Batch succeeded — all changes are in Firestore. Refresh is best-effort:
      // if it fails, the data is correct but the UI is stale.
      try {
        const updated = await getWorkOrders();
        setWorkOrders(updated);
      } catch (refreshErr) {
        console.error("Refresh failed after successful execution:", refreshErr);
        setSuccessMessage(
          `Recorded! ${wo.totalYield} ${wo.finishedGoodName} added to inventory. Refresh the page to see updated stock levels.`
        );
        return;
      }

      setSuccessMessage(
        `Production complete! ${wo.totalYield} ${wo.finishedGoodName} added to inventory.`
      );

    } catch (err) {
      // Only reaches here if batch.commit() threw — nothing was written.
      console.error("Failed to execute work order:", err);
      window.alert(
        "Failed to record production. No changes were made to inventory. Please try again."
      );
    } finally {
      // Always clears the loading state, regardless of which path exited above.
      setCompletingId(null);
    }
  };

  // ── Create form submit ───────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.recipeId) {
      setError("Please select a recipe.");
      return;
    }
    if (!formData.batchesOrdered || parseInt(formData.batchesOrdered) <= 0) {
      setError("Batches to produce must be at least 1.");
      return;
    }
    if (!formData.scheduledStart) {
      setError("Please set a scheduled start time.");
      return;
    }
    if (!formData.dueBy) {
      setError("Please set a due-by time.");
      return;
    }
    if (formData.dueBy <= formData.scheduledStart) {
      setError("Due-by time must be after the scheduled start time.");
      return;
    }

    setError(null);
    setSubmitting(true);

    const batches = parseInt(formData.batchesOrdered);

    // Build the complete snapshot. We store calculated values (ingredientsRequired,
    // totalYield, etc.) so the record stays accurate even if the recipe changes later.
    const workOrderData = {
      demandPlanId:     null,
      recipeId:         selectedRecipe.id,
      recipeName:       selectedRecipe.name,
      finishedGoodId:   selectedRecipe.finishedGoodId,
      finishedGoodName: selectedRecipe.finishedGoodName,
      batchesOrdered:   batches,
      batchesActual:    batches,
      totalYield,
      recipeYield:      selectedRecipe.yieldQuantity,
      scheduledStart:   formData.scheduledStart,
      dueBy:            formData.dueBy,
      status:           "planned",
      // Snapshot each ingredient's totalRequired so we don't need to recalculate
      // from the recipe if it's later edited.
      ingredientsRequired: ingredientCheck.map(({ ingredientId, ingredientName, quantity, unit, totalRequired }) => ({
        ingredientId, ingredientName, quantity, unit, totalRequired,
      })),
      ingredientsSufficient:   allIngredientsSufficient,
      // Store the list of short ingredients for quick reference on the card.
      insufficientIngredients: ingredientCheck
        .filter((ic) => !ic.sufficient)
        .map(({ ingredientName, shortfall, unit }) => ({ ingredientName, shortfall, unit })),
      notes:       formData.notes.trim(),
      createdBy:   user?.email ?? "",
      startedAt:   null,
      completedAt: null,
    };

    try {
      await addWorkOrder(workOrderData);
      const updated = await getWorkOrders();
      setWorkOrders(updated);
      handleCancelForm();
    } catch (err) {
      console.error("Failed to create work order:", err);
      setError("Failed to create work order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit form submit ─────────────────────────────────────────────────────
  const handleEditSubmit = async (e) => {
    e.preventDefault();

    const batches = parseInt(editData.batchesActual);
    if (!batches || batches <= 0) {
      setError("Actual batches must be at least 1.");
      return;
    }
    if (!editData.scheduledStart) {
      setError("Please set a scheduled start time.");
      return;
    }
    if (!editData.dueBy) {
      setError("Please set a due-by time.");
      return;
    }
    if (editData.dueBy <= editData.scheduledStart) {
      setError("Due-by time must be after the scheduled start time.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      await updateWorkOrder(editingId, {
        batchesActual:  batches,
        // Recalculate totalYield based on the updated actual batch count.
        totalYield:     batches * (editingWorkOrder?.recipeYield ?? 0),
        scheduledStart: editData.scheduledStart,
        dueBy:          editData.dueBy,
        notes:          editData.notes.trim(),
        // Persist the updated ingredient sufficiency so Today's Schedule cards
        // and the All Work Orders table reflect the new batchesActual count.
        ingredientsSufficient:   editAllSufficient,
        insufficientIngredients: editIngredientCheck
          .filter((ic) => !ic.sufficient)
          .map(({ ingredientName, shortfall, unit }) => ({ ingredientName, shortfall, unit })),
      });
      const updated = await getWorkOrders();
      setWorkOrders(updated);
      handleCancelForm();
    } catch (err) {
      console.error("Failed to update work order:", err);
      setError("Failed to update work order. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived filtered data ────────────────────────────────────────────────

  // Today's section: always reads from raw workOrders — never affected by
  // the date preset filter. Shows today's orders + any overdue ones.
  const todayAndOverdue = workOrders.filter(
    (wo) => isToday(wo.scheduledStart) || isOverdue(wo)
  );

  // ── Date preset calculations ─────────────────────────────────────────────
  // All strings use local time (same pattern as getTodayStr/isToday above).
  // Computed fresh each render so they're always accurate if the page is
  // left open overnight and the date rolls over.
  const now            = new Date();
  const todayStr       = getTodayStr();

  // This week: Monday → Sunday of the current calendar week.
  const mondayDate     = new Date(getMondayOfWeek(now));
  const sundayDate     = new Date(mondayDate);
  sundayDate.setDate(mondayDate.getDate() + 6);
  const mondayStr      = dateToStr(mondayDate);
  const sundayStr      = dateToStr(sundayDate);

  // Last week: Monday → Sunday of the previous calendar week.
  const lastMondayDate = new Date(mondayDate);
  lastMondayDate.setDate(mondayDate.getDate() - 7);
  const lastSundayDate = new Date(lastMondayDate);
  lastSundayDate.setDate(lastMondayDate.getDate() + 6);
  const lastMondayStr  = dateToStr(lastMondayDate);
  const lastSundayStr  = dateToStr(lastSundayDate);

  // This month: 1st → last day of current month.
  // new Date(year, month + 1, 0) gives the last day of the current month.
  const firstOfMonthStr = dateToStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastOfMonthStr  = dateToStr(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  // Filters workOrders by the selected date preset.
  // scheduledStart is "YYYY-MM-DDThh:mm" — slicing to 10 chars gives the date
  // portion for string comparison (ISO date strings sort lexicographically).
  const dateFilteredWOs = (() => {
    const d = (wo) => wo.scheduledStart ? wo.scheduledStart.slice(0, 10) : null;
    switch (datePreset) {
      case "today":
        return workOrders.filter((wo) => d(wo) === todayStr);
      case "thisWeek":
        return workOrders.filter((wo) => { const s = d(wo); return s && s >= mondayStr && s <= sundayStr; });
      case "lastWeek":
        return workOrders.filter((wo) => { const s = d(wo); return s && s >= lastMondayStr && s <= lastSundayStr; });
      case "thisMonth":
        return workOrders.filter((wo) => { const s = d(wo); return s && s >= firstOfMonthStr && s <= lastOfMonthStr; });
      default: // "allTime" — no date filter
        return workOrders;
    }
  })();

  // Count per status tab within the current date filter.
  // Used to show "Planned (3)" labels so the user can see what's behind each
  // tab before clicking it.
  const tabCounts = {
    planned:    dateFilteredWOs.filter((wo) => wo.status === "planned").length,
    inProgress: dateFilteredWOs.filter((wo) => wo.status === "inProgress").length,
    complete:   dateFilteredWOs.filter((wo) => wo.status === "complete").length,
    cancelled:  dateFilteredWOs.filter((wo) => wo.status === "cancelled").length,
  };

  // Final displayed rows: date filter first, then status tab filter.
  const filteredWorkOrders = dateFilteredWOs.filter((wo) => wo.status === activeTab);

  // ── Shared action buttons ────────────────────────────────────────────────
  // Returns the action button set for a given work order, used in both
  // the today cards and the all-orders table.
  const renderActions = (wo) => {
    const isStarting   = startingId === wo.id;
    const isCancelling = cancellingId === wo.id;

    if (wo.status === "complete" || wo.status === "cancelled") return null;

    return (
      <div className="flex items-center gap-3 flex-wrap">

        {/* Start — only for planned */}
        {wo.status === "planned" && (
          <button
            onClick={() => handleStart(wo.id)}
            disabled={isStarting || isCancelling}
            className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isStarting ? "Starting..." : "Start"}
          </button>
        )}

        {/* Complete — triggers the atomic production batch write */}
        {wo.status === "inProgress" && (
          <button
            onClick={() => handleComplete(wo)}
            disabled={completingId === wo.id}
            className="text-sm font-medium text-green-600 hover:text-green-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {completingId === wo.id ? "Completing..." : "Complete"}
          </button>
        )}

        {/* Edit — available on planned and inProgress */}
        <button
          onClick={() => handleEditStart(wo)}
          disabled={isStarting || isCancelling}
          className="text-sm font-medium text-stone-500 hover:text-stone-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Edit
        </button>

        {/* Cancel — only for planned */}
        {wo.status === "planned" && (
          <button
            onClick={() => handleCancelWorkOrder(wo.id, wo.recipeName)}
            disabled={isStarting || isCancelling}
            className="text-sm font-medium text-rose-500 hover:text-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isCancelling ? "Cancelling..." : "Cancel"}
          </button>
        )}

      </div>
    );
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading work orders...</p>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">

      {/* ── Page header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">Work Orders</h1>
          <p className="text-sm text-stone-500 mt-1">
            Schedule and track production runs.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={handleNewWorkOrder}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors"
          >
            New Work Order
          </button>
        )}
      </div>

      {/* ── Success banner ── */}
      {/* Shown after a production execution completes. Auto-dismissed after 6s.
          Rendered conditionally so it takes no space when there's nothing to show. */}
      {successMessage && (
        <div className="flex items-center justify-between rounded-md bg-green-50 border border-green-200 px-4 py-3">
          <p className="text-sm font-medium text-green-800">✓ {successMessage}</p>
          <button
            onClick={() => setSuccessMessage(null)}
            className="ml-4 text-green-600 hover:text-green-800 text-sm shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Section 1: Today's Schedule ── */}
      <section>
        <h2 className="text-base font-semibold text-stone-800 mb-4">
          Today&apos;s Schedule
          {todayAndOverdue.length > 0 && (
            <span className="ml-2 text-sm font-normal text-stone-400">
              {todayAndOverdue.length} order{todayAndOverdue.length !== 1 ? "s" : ""}
            </span>
          )}
        </h2>

        {todayAndOverdue.length === 0 ? (
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-6 py-8 text-center">
            <p className="text-sm text-stone-500">No work orders scheduled for today.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {todayAndOverdue.map((wo) => {
              const { label: statusLabel, badgeClass } = getStatusInfo(wo);
              const overdue = isOverdue(wo);

              return (
                <div
                  key={wo.id}
                  className={`rounded-lg border p-4 space-y-3 ${
                    overdue ? "border-rose-200 bg-rose-50" : "border-stone-200 bg-white"
                  }`}
                >
                  {/* Card header: recipe name + status badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-stone-800">{wo.recipeName}</p>
                      <p className="text-xs text-stone-500 mt-0.5">{wo.finishedGoodName}</p>
                      {/* MTO customer line — shown only when the work order
                          was created from a special (make-to-order) customer order */}
                      {wo.customerName && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-sm font-medium text-stone-700">{wo.customerName}</span>
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                            MTO
                          </span>
                        </div>
                      )}
                    </div>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Schedule details */}
                  <div className="text-sm space-y-1">
                    <p>
                      <span className="text-stone-400 w-16 inline-block text-xs">Batches</span>
                      <span className="font-medium text-stone-700">{wo.batchesActual}</span>
                      <span className="text-stone-400 ml-1 text-xs">
                        → {wo.totalYield} {wo.finishedGoodName}
                      </span>
                    </p>
                    <p>
                      <span className="text-stone-400 w-16 inline-block text-xs">Start</span>
                      <span className={overdue ? "text-rose-600 font-medium text-sm" : "text-stone-600 text-sm"}>
                        {formatDateTime(wo.scheduledStart)}
                      </span>
                    </p>
                    <p>
                      <span className="text-stone-400 w-16 inline-block text-xs">Due</span>
                      <span className="text-stone-600 text-sm">{formatDateTime(wo.dueBy)}</span>
                    </p>
                  </div>

                  {/* Ingredient sufficiency summary */}
                  <p className="text-xs font-medium">
                    {wo.ingredientsSufficient ? (
                      <span className="text-green-700">✓ All ingredients available</span>
                    ) : (
                      <span className="text-rose-600">
                        ⚠ {wo.insufficientIngredients?.length ?? "Some"}{" "}
                        ingredient{(wo.insufficientIngredients?.length ?? 2) !== 1 ? "s" : ""} short
                      </span>
                    )}
                  </p>

                  {/* Action buttons */}
                  {renderActions(wo)}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 2: All Work Orders ── */}
      <section>
        <h2 className="text-base font-semibold text-stone-800 mb-4">All Work Orders</h2>

        {/* Date preset filter bar */}
        <div className="flex gap-1 mb-3 flex-wrap">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => setDatePreset(preset.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                datePreset === preset.key
                  ? "bg-amber-500 text-stone-900"
                  : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Status tabs — counts reflect the active date preset */}
        <div className="flex gap-1 mb-4 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-amber-100 text-amber-800"
                  : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
              }`}
            >
              {tab.label} ({tabCounts[tab.key]})
            </button>
          ))}
        </div>

        {filteredWorkOrders.length === 0 ? (
          <p className="text-stone-500 text-sm">
            No {TABS.find((t) => t.key === activeTab)?.label.toLowerCase()} work orders
            {datePreset !== "allTime" ? " in this date range" : ""}.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-stone-200">
            <table className="w-full text-sm text-left">

              <thead className="bg-stone-50 border-b border-stone-200">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Recipe</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Finished Good</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Ordered</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Actual</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Scheduled Start</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Due By</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Ingredients</th>
                  <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stone-100 bg-white">
                {filteredWorkOrders.map((wo) => {
                  const { label: statusLabel, badgeClass } = getStatusInfo(wo);
                  const isCancelled = wo.status === "cancelled";

                  return (
                    <tr key={wo.id} className={isCancelled ? "opacity-50" : ""}>

                      {/* Customer — shows name + MTO badge for special orders, dash for standard */}
                      <td className="px-4 py-3">
                        {wo.customerName ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`font-medium ${isCancelled ? "text-stone-400 line-through" : "text-stone-800"}`}>
                              {wo.customerName}
                            </span>
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800">
                              MTO
                            </span>
                          </div>
                        ) : (
                          <span className="text-stone-400">—</span>
                        )}
                      </td>

                      <td className={`px-4 py-3 font-medium ${isCancelled ? "text-stone-400 line-through" : "text-stone-800"}`}>
                        {wo.recipeName}
                      </td>

                      <td className="px-4 py-3 text-stone-600">{wo.finishedGoodName}</td>

                      {/* Batches Ordered — locked at creation */}
                      <td className="px-4 py-3 text-stone-600">{wo.batchesOrdered}</td>

                      {/* Batches Actual — editable; highlight if it differs from ordered */}
                      <td className="px-4 py-3">
                        <span className={wo.batchesActual !== wo.batchesOrdered ? "font-medium text-amber-700" : "text-stone-600"}>
                          {wo.batchesActual}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-stone-600">{formatDateTime(wo.scheduledStart)}</td>
                      <td className="px-4 py-3 text-stone-600">{formatDateTime(wo.dueBy)}</td>

                      {/* Status badge */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>
                          {statusLabel}
                        </span>
                      </td>

                      {/* Ingredient sufficiency */}
                      <td className="px-4 py-3">
                        {wo.ingredientsSufficient ? (
                          <span className="text-xs font-medium text-green-700">Yes</span>
                        ) : (
                          <span className="text-xs font-medium text-rose-600">No</span>
                        )}
                      </td>

                      <td className="px-4 py-3">{renderActions(wo)}</td>
                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}
      </section>

      {/* ── Form section ── */}
      {showForm && (
        <div id="work-order-form" className="border-t border-stone-200 pt-8">

          {/* Form header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-stone-800">
              {formMode === "edit" ? "Edit Work Order" : "New Work Order"}
            </h2>
            <button
              onClick={handleCancelForm}
              className="text-sm text-stone-500 hover:text-stone-800"
            >
              Cancel
            </button>
          </div>

          {/* ── Create form ── */}
          {formMode === "create" && (
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Recipe + Batches */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* Recipe dropdown */}
                <div>
                  <label htmlFor="recipeId" className="block text-sm font-medium text-stone-700 mb-1">
                    Recipe <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="recipeId"
                    name="recipeId"
                    value={formData.recipeId}
                    onChange={handleRecipeSelect}
                    className={inputCls}
                  >
                    <option value="">Select a recipe</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  {/* Linked finished good + yield info — shown after selection */}
                  {selectedRecipe && (
                    <p className="text-xs text-stone-500 mt-1.5">
                      Makes:{" "}
                      <span className="font-medium text-stone-700">{selectedRecipe.finishedGoodName}</span>
                      {" "}·{" "}
                      <span className="font-medium text-stone-700">
                        {selectedRecipe.yieldQuantity} {selectedRecipe.yieldUnit}
                      </span>
                      {" "}per batch
                    </p>
                  )}
                </div>

                {/* Batches to produce */}
                <div>
                  <label htmlFor="batchesOrdered" className="block text-sm font-medium text-stone-700 mb-1">
                    Batches to Produce <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="batchesOrdered"
                    name="batchesOrdered"
                    type="number"
                    min="1"
                    step="1"
                    value={formData.batchesOrdered}
                    onChange={handleChange}
                    placeholder="0"
                    className={inputCls}
                  />
                  {/* Real-time yield total — updates on every keystroke */}
                  {selectedRecipe && batchCount > 0 && (
                    <p className="text-xs text-stone-500 mt-1.5">
                      Total yield:{" "}
                      <span className="font-medium text-stone-700">
                        {totalYield} {selectedRecipe.yieldUnit}
                      </span>
                    </p>
                  )}
                </div>

              </div>

              {/* ── Ingredient sufficiency check ── */}
              {/* Derived from batchCount + loaded ingredient stock data.
                  Updates in real time with every change to batchesOrdered. */}
              {selectedRecipe && batchCount > 0 && ingredientCheck.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-stone-700 mb-2">
                    Ingredients Required
                    <span className="ml-2 font-normal text-stone-400">
                      ({batchCount} batch{batchCount !== 1 ? "es" : ""})
                    </span>
                  </p>

                  {/* Per-ingredient rows */}
                  <div className="rounded-md border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                    {ingredientCheck.map((ic) => (
                      <div
                        key={ic.ingredientId}
                        className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                          ic.sufficient ? "bg-white" : "bg-rose-50"
                        }`}
                      >
                        <span className={`font-medium ${ic.sufficient ? "text-stone-700" : "text-rose-700"}`}>
                          {ic.sufficient ? "✓" : "✗"} {ic.ingredientName}
                        </span>
                        <div className="text-right text-stone-500">
                          <span>need {ic.totalRequired} {ic.unit}</span>
                          <span className="text-stone-300 mx-2">·</span>
                          <span>have {ic.currentStock} {ic.unit}</span>
                          {!ic.sufficient && (
                            <span className="ml-2 text-rose-600 font-medium">
                              short {ic.shortfall} {ic.unit}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Overall sufficiency summary line */}
                  <p className={`mt-2 text-sm font-medium ${allIngredientsSufficient ? "text-green-700" : "text-rose-600"}`}>
                    {allIngredientsSufficient
                      ? "✓ All ingredients available"
                      : `⚠ ${ingredientCheck.filter((ic) => !ic.sufficient).length} ingredient${
                          ingredientCheck.filter((ic) => !ic.sufficient).length !== 1 ? "s" : ""
                        } insufficient — consider restocking before running`
                    }
                  </p>
                </div>
              )}

              {/* Scheduled Start + Due By */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="scheduledStart" className="block text-sm font-medium text-stone-700 mb-1">
                    Scheduled Start <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="scheduledStart"
                    name="scheduledStart"
                    type="datetime-local"
                    value={formData.scheduledStart}
                    onChange={handleChange}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="dueBy" className="block text-sm font-medium text-stone-700 mb-1">
                    Due By <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="dueBy"
                    name="dueBy"
                    type="datetime-local"
                    value={formData.dueBy}
                    onChange={handleChange}
                    className={inputCls}
                  />
                </div>
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
                  placeholder="e.g. For Saturday market"
                  className={inputCls}
                />
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Creating..." : "Create Work Order"}
              </button>

            </form>
          )}

          {/* ── Edit form ── */}
          {/* Only batchesActual, scheduledStart, dueBy, and notes are editable.
              Recipe and batchesOrdered are locked — shown as read-only above the fields. */}
          {formMode === "edit" && editingWorkOrder && (
            <form onSubmit={handleEditSubmit} className="space-y-6">

              {/* Locked fields — read-only display */}
              <div className="rounded-md bg-stone-50 border border-stone-200 px-4 py-3 space-y-1.5">
                <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">
                  Locked — set at creation
                </p>
                <p className="text-sm">
                  <span className="text-stone-500 w-36 inline-block">Recipe</span>
                  <span className="font-medium text-stone-700">{editingWorkOrder.recipeName}</span>
                </p>
                <p className="text-sm">
                  <span className="text-stone-500 w-36 inline-block">Finished Good</span>
                  <span className="font-medium text-stone-700">{editingWorkOrder.finishedGoodName}</span>
                </p>
                <p className="text-sm">
                  <span className="text-stone-500 w-36 inline-block">Batches Ordered</span>
                  <span className="font-medium text-stone-700">{editingWorkOrder.batchesOrdered}</span>
                </p>
              </div>

              {/* Batches Actual — in its own single-column grid so the ingredient
                  check panel can sit between it and the date fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="batchesActual" className="block text-sm font-medium text-stone-700 mb-1">
                    Batches Actual <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="batchesActual"
                    name="batchesActual"
                    type="number"
                    min="1"
                    step="1"
                    value={editData.batchesActual}
                    onChange={handleEditChange}
                    className={inputCls}
                  />
                  {/* Real-time yield preview — updates on every keystroke */}
                  {editBatchCount > 0 && editingWorkOrder && (
                    <p className="text-xs text-stone-500 mt-1.5">
                      Total yield:{" "}
                      <span className="font-medium text-stone-700">
                        {editBatchCount * (editingWorkOrder.recipeYield ?? 0)} {editingWorkOrder.finishedGoodName}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* ── Ingredient sufficiency check (edit form) ── */}
              {/* Derived from editBatchCount + freshly loaded ingredients state.
                  Same pattern as the create form — recomputed on every render. */}
              {editingWorkOrder && editBatchCount > 0 && editIngredientCheck.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-stone-700 mb-2">
                    Ingredients Required
                    <span className="ml-2 font-normal text-stone-400">
                      ({editBatchCount} batch{editBatchCount !== 1 ? "es" : ""})
                    </span>
                  </p>

                  <div className="rounded-md border border-stone-200 divide-y divide-stone-100 overflow-hidden">
                    {editIngredientCheck.map((ic) => (
                      <div
                        key={ic.ingredientId}
                        className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                          ic.sufficient ? "bg-white" : "bg-rose-50"
                        }`}
                      >
                        <span className={`font-medium ${ic.sufficient ? "text-stone-700" : "text-rose-700"}`}>
                          {ic.sufficient ? "✓" : "✗"} {ic.ingredientName}
                        </span>
                        <div className="text-right text-stone-500">
                          <span>need {ic.totalRequired} {ic.unit}</span>
                          <span className="text-stone-300 mx-2">·</span>
                          <span>have {ic.currentStock} {ic.unit}</span>
                          {!ic.sufficient && (
                            <span className="ml-2 text-rose-600 font-medium">
                              short {ic.shortfall} {ic.unit}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className={`mt-2 text-sm font-medium ${editAllSufficient ? "text-green-700" : "text-rose-600"}`}>
                    {editAllSufficient
                      ? "✓ All ingredients available"
                      : `⚠ ${editIngredientCheck.filter((ic) => !ic.sufficient).length} ingredient${
                          editIngredientCheck.filter((ic) => !ic.sufficient).length !== 1 ? "s" : ""
                        } insufficient — consider restocking before running`
                    }
                  </p>
                </div>
              )}

              {/* Scheduled Start + Due By */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div>
                  <label htmlFor="editScheduledStart" className="block text-sm font-medium text-stone-700 mb-1">
                    Scheduled Start <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="editScheduledStart"
                    name="scheduledStart"
                    type="datetime-local"
                    value={editData.scheduledStart}
                    onChange={handleEditChange}
                    className={inputCls}
                  />
                </div>

                <div>
                  <label htmlFor="editDueBy" className="block text-sm font-medium text-stone-700 mb-1">
                    Due By <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="editDueBy"
                    name="dueBy"
                    type="datetime-local"
                    value={editData.dueBy}
                    onChange={handleEditChange}
                    className={inputCls}
                  />
                </div>

              </div>

              {/* Notes */}
              <div>
                <label htmlFor="editNotes" className="block text-sm font-medium text-stone-700 mb-1">
                  Notes{" "}
                  <span className="text-stone-400 font-normal">(optional)</span>
                </label>
                <input
                  id="editNotes"
                  name="notes"
                  type="text"
                  value={editData.notes}
                  onChange={handleEditChange}
                  placeholder="e.g. For Saturday market"
                  className={inputCls}
                />
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Saving..." : "Save Changes"}
              </button>

            </form>
          )}

        </div>
      )}

    </div>
  );
}
