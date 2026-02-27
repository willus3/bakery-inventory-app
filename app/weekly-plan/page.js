// Client Component — required because we use React hooks (useState, useEffect).
"use client";

import { useState, useEffect } from "react";
import {
  getRecipes,
  getIngredients,
  getWeeklyTemplates,
  saveWeeklyTemplate,
  getWeeklyPlans,
  generateWorkOrdersForWeek,
} from "@/lib/firestore";
import { useAuth } from "@/context/AuthContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS       = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
const DAY_LABELS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ─── Module-level helpers ─────────────────────────────────────────────────────

// Returns an object with all seven days set to 0 — used to seed new rows.
const emptyWeekQty = () => ({
  monday: 0, tuesday: 0, wednesday: 0, thursday: 0,
  friday: 0, saturday: 0, sunday: 0,
});

// Deep-copies a plain object — safe for objects containing only numbers.
// Used to clone templateQty into planQty so edits to one don't affect the other.
const deepCopy = (obj) => JSON.parse(JSON.stringify(obj));

// Given any Date, returns a new Date set to that week's Monday at midnight.
// getDay() returns 0 for Sunday, 1 for Monday, ..., 6 for Saturday.
// The formula maps Sunday → roll back 6 days, Monday → 0, Tuesday → -1, etc.
const getMondayOfWeek = (date) => {
  const d   = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Converts a Date to "YYYY-MM-DD" using local time (not UTC).
// We avoid toISOString() because that converts to UTC and can roll back a day
// in negative-UTC-offset timezones.
const toDateString = (date) => {
  const yyyy = date.getFullYear();
  const mm   = String(date.getMonth() + 1).padStart(2, "0");
  const dd   = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Returns "Week of Mar 2 – Mar 8, 2026" from a Monday Date.
const formatWeekLabel = (monday) => {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const opts  = { month: "short", day: "numeric" };
  const start = monday.toLocaleDateString("en-US", opts);
  const end   = sunday.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `Week of ${start} – ${end}`;
};

// Parses a week-quantity object: all seven values run through parseFloat || 0.
const parseWeekQty = (qty) => {
  const result = {};
  for (const day of DAYS) result[day] = parseFloat(qty?.[day]) || 0;
  return result;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeeklyPlanPage() {
  const { user } = useAuth();

  // ─── Fetched data ─────────────────────────────────────────────────────────
  const [rows,        setRows]        = useState([]); // { finishedGoodId, finishedGoodName, recipeId, recipeName, recipeYield }
  const [recipes,     setRecipes]     = useState([]); // full recipe docs — needed for ingredient lists
  const [ingredients, setIngredients] = useState([]); // for stock sufficiency check
  const [weeklyPlans, setWeeklyPlans] = useState([]); // for detecting duplicate weeks
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(null);

  // ─── Template section ─────────────────────────────────────────────────────
  // templateQty: { [finishedGoodId]: { monday: 0, tuesday: 0, ... } }
  const [templateQty,    setTemplateQty]    = useState({});
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved,  setTemplateSaved]  = useState(false);

  // ─── Plan section ─────────────────────────────────────────────────────────
  // weekStart is always a Monday Date. planQty mirrors templateQty's shape.
  const [weekStart,        setWeekStart]        = useState(() => getMondayOfWeek(new Date()));
  const [planQty,          setPlanQty]          = useState({});
  const [generating,       setGenerating]       = useState(false);
  const [generationResult, setGenerationResult] = useState(null); // { count, weekLabel }
  const [generateError,    setGenerateError]    = useState(null);

  // ─── Fetch all data on mount ──────────────────────────────────────────────
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [recipesData, ingredientsData, templatesData, plansData] = await Promise.all([
          getRecipes(),
          getIngredients(),
          getWeeklyTemplates(),
          getWeeklyPlans(),
        ]);

        // Build one row per active recipe, picking up the fields the grids need.
        const newRows = recipesData.map((recipe) => ({
          finishedGoodId:   recipe.finishedGoodId,
          finishedGoodName: recipe.finishedGoodName,
          recipeId:         recipe.id,
          recipeName:       recipe.name,
          recipeYield:      recipe.yieldQuantity, // units per batch
        }));

        // Build templateQty keyed by finishedGoodId.
        // If no template exists yet for a row, default all days to 0.
        const tqty = {};
        for (const row of newRows) {
          const template = templatesData.find((t) => t.finishedGoodId === row.finishedGoodId);
          tqty[row.finishedGoodId] = template?.quantities ?? emptyWeekQty();
        }

        setRecipes(recipesData);
        setIngredients(ingredientsData);
        setWeeklyPlans(plansData);
        setRows(newRows);
        setTemplateQty(tqty);
        setPlanQty(deepCopy(tqty));       // plan starts as a copy of the template

      } catch (err) {
        console.error("Failed to load weekly plan data:", err);
        setLoadError("Failed to load data. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // ─── Reset plan to template when the week changes ────────────────────────
  // Runs whenever the owner navigates to a different week. Clears the plan
  // grid back to template defaults so stale edits don't carry over.
  useEffect(() => {
    if (Object.keys(templateQty).length > 0) {
      setPlanQty(deepCopy(templateQty));
      setGenerationResult(null);
      setGenerateError(null);
    }
  }, [weekStart]); // eslint-disable-line react-hooks/exhaustive-deps
  // Note: templateQty intentionally omitted from deps — we only want this
  // effect when the week changes, not when the owner edits the template.

  // ─── Derived values (computed every render, no extra state needed) ────────

  // The 7 Date objects for the selected week's columns.
  const weekDates = DAYS.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const weekLabel        = formatWeekLabel(weekStart);
  const weekStartDateStr = toDateString(weekStart);

  // Does a plan already exist for the currently selected week?
  const existingPlan = weeklyPlans.find((p) => p.weekStartDate === weekStartDateStr);

  // ── Ingredient sufficiency check ──────────────────────────────────────────
  // Aggregate total ingredient needs across the whole plan week.
  // This runs on every render — O(rows × days × ingredients per recipe).
  // For a bakery with a handful of products this is negligible.
  const weeklyNeeds = {}; // { [ingredientId]: { name, unit, totalNeeded } }
  for (const row of rows) {
    const recipe = recipes.find((r) => r.id === row.recipeId);
    if (!recipe) continue;

    for (let i = 0; i < DAYS.length; i++) {
      const qty = parseFloat(planQty[row.finishedGoodId]?.[DAYS[i]]) || 0;
      if (qty === 0) continue;
      const batches = Math.ceil(qty / row.recipeYield);

      for (const ing of recipe.ingredients ?? []) {
        if (!weeklyNeeds[ing.ingredientId]) {
          weeklyNeeds[ing.ingredientId] = {
            name:        ing.ingredientName,
            unit:        ing.unit,
            totalNeeded: 0,
          };
        }
        weeklyNeeds[ing.ingredientId].totalNeeded += ing.quantity * batches;
      }
    }
  }

  // Compare totals against current stock and sort alphabetically.
  const ingredientSummary = Object.entries(weeklyNeeds).map(([id, req]) => {
    const have = ingredients.find((i) => i.id === id)?.currentStock ?? 0;
    return {
      ingredientId: id,
      name:         req.name,
      unit:         req.unit,
      totalNeeded:  req.totalNeeded,
      have,
      short:        req.totalNeeded > have,
      shortage:     Math.max(0, req.totalNeeded - have),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  // A Set of ingredient IDs that are short — O(1) per-cell lookup.
  const shortIngredientIds = new Set(
    ingredientSummary.filter((s) => s.short).map((s) => s.ingredientId)
  );

  // Returns true if any ingredient used by this row's recipe is short.
  const rowIsShort = (row) => {
    const recipe = recipes.find((r) => r.id === row.recipeId);
    return recipe?.ingredients.some((ing) => shortIngredientIds.has(ing.ingredientId)) ?? false;
  };

  // Is at least one plan cell > 0? Gates the "Generate Work Orders" button.
  const hasAnyPlanQty = rows.some((row) =>
    DAYS.some((day) => (parseFloat(planQty[row.finishedGoodId]?.[day]) || 0) > 0)
  );

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleTemplateChange = (fgId, day, value) => {
    setTemplateQty((prev) => ({
      ...prev,
      [fgId]: { ...prev[fgId], [day]: value },
    }));
  };

  const handlePlanChange = (fgId, day, value) => {
    setPlanQty((prev) => ({
      ...prev,
      [fgId]: { ...prev[fgId], [day]: value },
    }));
  };

  const goToPrevWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const goToNextWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  // Saves all template rows to Firestore using the upsert function.
  // Promise.all fires all saves in parallel — one write per product.
  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    try {
      await Promise.all(
        rows.map((row) =>
          saveWeeklyTemplate(row.finishedGoodId, {
            finishedGoodId:   row.finishedGoodId,
            finishedGoodName: row.finishedGoodName,
            recipeId:         row.recipeId,
            recipeName:       row.recipeName,
            recipeYield:      row.recipeYield,
            // Parse all values to numbers before saving so Firestore doesn't
            // store strings (which would break batch-count calculations later).
            quantities: parseWeekQty(templateQty[row.finishedGoodId]),
            updatedBy:  user?.email || "",
          })
        )
      );
      setTemplateSaved(true);
      setTimeout(() => setTemplateSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save template:", err);
      window.alert("Failed to save template. Please try again.");
    } finally {
      setSavingTemplate(false);
    }
  };

  // Saves the weekly plan and generates all work orders in one atomic batch.
  const handleGenerateWorkOrders = async () => {
    if (existingPlan) {
      const ok = window.confirm(
        `A plan already exists for this week (${existingPlan.workOrdersGenerated} work orders). ` +
        `Create additional work orders for this week anyway?`
      );
      if (!ok) return;
    }

    setGenerating(true);
    setGenerateError(null);
    setGenerationResult(null);

    try {
      const planData = {
        weekStartDate: weekStartDateStr,
        weekLabel,
        // Store all rows in the plan document; quantities are parsed to numbers.
        items: rows.map((row) => ({
          finishedGoodId:   row.finishedGoodId,
          finishedGoodName: row.finishedGoodName,
          recipeId:         row.recipeId,
          recipeName:       row.recipeName,
          recipeYield:      row.recipeYield,
          quantities:       parseWeekQty(planQty[row.finishedGoodId]),
        })),
      };

      const { count } = await generateWorkOrdersForWeek(
        planData, recipes, ingredients, user?.email
      );

      // Refresh the plans list so the duplicate-week warning stays current.
      const updatedPlans = await getWeeklyPlans();
      setWeeklyPlans(updatedPlans);
      setGenerationResult({ count, weekLabel });

    } catch (err) {
      console.error("Failed to generate work orders:", err);
      setGenerateError("Failed to generate work orders. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  // ─── Loading / error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading weekly plan data...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <p className="text-rose-600 text-sm">{loadError}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12">
        <h1 className="text-2xl font-semibold text-stone-800 mb-2">Weekly Plan</h1>
        <p className="text-stone-500 text-sm">
          No active recipes found. Add recipes on the{" "}
          <a href="/recipes" className="text-amber-700 underline hover:text-amber-900">Recipes</a> page first.
        </p>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-14">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">Weekly Plan</h1>
        <p className="text-sm text-stone-500 mt-1">
          Set your standard weekly production template, then generate work orders for any specific week.
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 1 — Weekly Template
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-stone-800">Weekly Template</h2>
          <p className="text-sm text-stone-500 mt-0.5">
            Your standard daily quantities per product. These are copied as the
            starting point for each new week's plan.
          </p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="text-sm text-left w-full">

            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider min-w-40">
                  Product
                </th>
                {DAY_LABELS.map((label) => (
                  <th key={label} className="px-3 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider text-center">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 bg-white">
              {rows.map((row) => (
                <tr key={row.finishedGoodId} className="hover:bg-stone-50">

                  {/* Product name + batch yield hint */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-800">{row.finishedGoodName}</div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      {row.recipeYield} per batch
                    </div>
                  </td>

                  {/* One editable cell per day */}
                  {DAYS.map((day) => {
                    const qty     = parseFloat(templateQty[row.finishedGoodId]?.[day]) || 0;
                    const batches = qty > 0 ? Math.ceil(qty / row.recipeYield) : null;
                    return (
                      <td key={day} className="px-2 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={templateQty[row.finishedGoodId]?.[day] ?? 0}
                          onChange={(e) => handleTemplateChange(row.finishedGoodId, day, e.target.value)}
                          className="w-16 rounded border border-stone-300 px-2 py-1 text-sm text-stone-800 text-center focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        />
                        {batches !== null && (
                          <div className="text-xs text-stone-400 mt-0.5">
                            {batches} {batches === 1 ? "batch" : "batches"}
                          </div>
                        )}
                      </td>
                    );
                  })}

                </tr>
              ))}
            </tbody>

          </table>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={handleSaveTemplate}
            disabled={savingTemplate}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {savingTemplate ? "Saving..." : "Save Template"}
          </button>
          {templateSaved && (
            <span className="text-sm text-green-700 font-medium">Template saved.</span>
          )}
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════════
          SECTION 2 — Weekly Plan Generator
      ══════════════════════════════════════════════════════════════════════ */}
      <section className="border-t border-stone-200 pt-10 space-y-6">

        <div>
          <h2 className="text-lg font-semibold text-stone-800">Weekly Plan Generator</h2>
          <p className="text-sm text-stone-500 mt-0.5">
            Adjust quantities for a specific week, then generate work orders in one click.
          </p>
        </div>

        {/* ── Week selector ── */}
        <div className="flex items-center gap-3">
          <button
            onClick={goToPrevWeek}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            ← Previous
          </button>
          <span className="text-sm font-semibold text-stone-800 min-w-56 text-center">
            {weekLabel}
          </span>
          <button
            onClick={goToNextWeek}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Next →
          </button>
          {existingPlan && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
              {existingPlan.workOrdersGenerated} orders already generated
            </span>
          )}
        </div>

        {/* ── Plan grid ── */}
        <div className="overflow-x-auto rounded-lg border border-stone-200">
          <table className="text-sm text-left w-full">

            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider min-w-40">
                  Product
                </th>
                {weekDates.map((d, i) => (
                  <th key={DAYS[i]} className="px-3 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider text-center">
                    {DAY_LABELS[i]}
                    <div className="text-stone-400 normal-case font-normal">
                      {d.getMonth() + 1}/{d.getDate()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 bg-white">
              {rows.map((row) => {
                const isShort = rowIsShort(row);
                return (
                  <tr key={row.finishedGoodId}>

                    {/* Product name */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-800">{row.finishedGoodName}</div>
                      <div className="text-xs text-stone-400 mt-0.5">{row.recipeYield} per batch</div>
                    </td>

                    {/* Plan cells — color-coded by qty + ingredient sufficiency */}
                    {DAYS.map((day) => {
                      const qty     = parseFloat(planQty[row.finishedGoodId]?.[day]) || 0;
                      const batches = qty > 0 ? Math.ceil(qty / row.recipeYield) : null;

                      // Green: qty > 0 and all ingredients sufficient.
                      // Amber: qty > 0 but this row has a weekly ingredient shortfall.
                      // White: no production planned.
                      let cellBg, inputBorder, inputRing;
                      if (qty === 0) {
                        cellBg      = "";
                        inputBorder = "border-stone-300";
                        inputRing   = "focus:ring-amber-400";
                      } else if (isShort) {
                        cellBg      = "bg-amber-50";
                        inputBorder = "border-amber-300";
                        inputRing   = "focus:ring-amber-400";
                      } else {
                        cellBg      = "bg-green-50";
                        inputBorder = "border-green-300";
                        inputRing   = "focus:ring-green-400";
                      }

                      return (
                        <td key={day} className={`px-2 py-2 text-center ${cellBg}`}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={planQty[row.finishedGoodId]?.[day] ?? 0}
                            onChange={(e) => handlePlanChange(row.finishedGoodId, day, e.target.value)}
                            className={`w-16 rounded border ${inputBorder} px-2 py-1 text-sm text-stone-800 text-center focus:outline-none focus:ring-2 ${inputRing} focus:border-transparent bg-transparent`}
                          />
                          {batches !== null && (
                            <div className={`text-xs mt-0.5 ${isShort ? "text-amber-600" : "text-stone-400"}`}>
                              {batches} {batches === 1 ? "batch" : "batches"}
                            </div>
                          )}
                        </td>
                      );
                    })}

                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>

        {/* ── Color key ── */}
        <div className="flex items-center gap-6 text-xs text-stone-500">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300" />
            Ingredients sufficient
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-300" />
            Ingredient shortfall this week
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-white border border-stone-300" />
            No production
          </div>
        </div>

        {/* ── Weekly ingredient summary ── */}
        {ingredientSummary.length > 0 && (
          <div className="rounded-lg border border-stone-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-200">
              <p className="text-xs font-semibold text-stone-600 uppercase tracking-wider">
                Weekly Ingredient Requirements
              </p>
            </div>
            <ul className="divide-y divide-stone-100">
              {ingredientSummary.map((s) => (
                <li
                  key={s.ingredientId}
                  className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                    s.short ? "bg-rose-50" : ""
                  }`}
                >
                  <span className={`font-medium ${s.short ? "text-rose-800" : "text-stone-700"}`}>
                    {s.name}
                  </span>
                  <span className={s.short ? "text-rose-700" : "text-stone-500"}>
                    Need {s.totalNeeded.toFixed(1)} {s.unit}
                    {" · "}
                    Have {s.have.toFixed(1)} {s.unit}
                    {s.short && (
                      <span className="ml-2 font-semibold text-rose-700">
                        — SHORT {s.shortage.toFixed(1)} {s.unit}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Generate button + result ── */}
        <div className="space-y-3">
          {generateError && (
            <p className="text-sm text-rose-600">{generateError}</p>
          )}

          {generationResult && (
            <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3">
              <p className="text-sm font-medium text-green-800">
                Generated {generationResult.count} work{" "}
                {generationResult.count === 1 ? "order" : "orders"} for {generationResult.weekLabel}.
              </p>
              <p className="text-xs text-green-700 mt-0.5">
                View and manage them on the{" "}
                <a href="/work-orders" className="underline hover:text-green-900">Work Orders</a> page.
              </p>
            </div>
          )}

          <button
            onClick={handleGenerateWorkOrders}
            disabled={generating || !hasAnyPlanQty}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-stone-900 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? "Generating..." : "Generate Work Orders"}
          </button>
          {!hasAnyPlanQty && (
            <p className="text-xs text-stone-400">
              Enter quantities for at least one product and day to enable generation.
            </p>
          )}
        </div>

      </section>
    </div>
  );
}
