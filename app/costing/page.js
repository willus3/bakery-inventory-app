// Client Component — uses hooks for data fetching.
"use client";

import { useState, useEffect } from "react";
import { getRecipes, getIngredients } from "@/lib/firestore";

// The Costing page.
// Shows a detailed ingredient-level cost breakdown for every active recipe.
// All cost math is derived state — no useEffect or extra state needed beyond
// the raw recipes and ingredients arrays.
export default function CostingPage() {

  const [recipes,     setRecipes]     = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [loading,     setLoading]     = useState(true);

  // ─── Initial data fetch ──────────────────────────────────────────────────
  // Recipes and ingredients are fetched in parallel. Costs are calculated
  // from the ingredients array at render time — no separate cost state needed.
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [recipeData, ingredientData] = await Promise.all([
          getRecipes(),
          getIngredients(),
        ]);
        setRecipes(recipeData);
        setIngredients(ingredientData);
      } catch (err) {
        console.error("Failed to load costing data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, []);

  // ─── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-stone-500 text-sm">Loading costing data...</p>
      </div>
    );
  }

  // ─── Ingredient lookup map ───────────────────────────────────────────────
  // Built once here (outside the recipe map loop) for O(1) lookups.
  // Key = Firestore ingredient document ID, value = full ingredient object.
  // This is the "join" between the recipe's ingredientId references and the
  // actual ingredient data (including costPerUnit) from the ingredients collection.
  const ingredientMap = Object.fromEntries(
    ingredients.map((ing) => [ing.id, ing])
  );

  // ─── Main render ─────────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-semibold text-stone-800">Recipe Costing</h1>
        <p className="text-sm text-stone-500 mt-1">
          Ingredient cost breakdown for all active recipes
        </p>
      </div>

      {/* ── Recipe cards ── */}
      {recipes.length === 0 ? (
        <p className="text-stone-500 text-sm">No active recipes found.</p>
      ) : (
        <div className="space-y-6">
          {recipes.map((recipe) => {

            // Build a row object for each ingredient in this recipe.
            // We look up the ingredient by ID to get its costPerUnit.
            // ?? 0 handles ingredients that predate the costPerUnit field.
            const rows = recipe.ingredients.map((ing) => {
              const ingData    = ingredientMap[ing.ingredientId];
              const costPerUnit = ingData?.costPerUnit ?? 0;
              const lineCost   = costPerUnit * ing.quantity;
              return {
                ...ing,
                costPerUnit,
                lineCost,
                hasCost: costPerUnit > 0,
              };
            });

            const allHaveCosts   = rows.every((r) => r.hasCost);
            const anyMissingCost = rows.some((r) => !r.hasCost);
            const batchCost      = rows.reduce((sum, r) => sum + r.lineCost, 0);
            const unitCost       = batchCost / recipe.yieldQuantity;

            return (
              <div
                key={recipe.id}
                className={`rounded-lg border p-6 ${
                  allHaveCosts ? "border-green-200" : "border-amber-200"
                }`}
              >

                {/* Card header */}
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h2 className="text-base font-semibold text-stone-800">
                      {recipe.name}
                    </h2>
                    <p className="text-sm text-stone-500 mt-0.5">
                      {recipe.finishedGoodName} · Yield: {recipe.yieldQuantity} {recipe.yieldUnit}
                    </p>
                  </div>
                  {anyMissingCost && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-full shrink-0 ml-4">
                      Incomplete costs
                    </span>
                  )}
                </div>

                {/* Ingredient cost table */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-200">
                      <th className="pb-2 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                        Ingredient
                      </th>
                      <th className="pb-2 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                        Qty
                      </th>
                      <th className="pb-2 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                        Unit
                      </th>
                      <th className="pb-2 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                        Cost/Unit
                      </th>
                      <th className="pb-2 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                        Line Cost
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-stone-100">
                    {rows.map((row, i) => (
                      <tr key={i}>
                        <td className="py-2 text-stone-700">{row.ingredientName}</td>
                        <td className="py-2 text-right text-stone-600">{row.quantity}</td>
                        <td className="py-2 text-right text-stone-600">{row.unit}</td>
                        {/* Cost/Unit — amber when missing, normal when set */}
                        <td className={`py-2 text-right ${row.hasCost ? "text-stone-600" : "text-amber-600"}`}>
                          {row.hasCost
                            ? `$${row.costPerUnit.toFixed(2)}/${row.unit}`
                            : "No cost set"}
                        </td>
                        <td className={`py-2 text-right font-medium ${row.hasCost ? "text-stone-700" : "text-amber-600"}`}>
                          {row.hasCost ? `$${row.lineCost.toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Totals footer */}
                  <tfoot>
                    <tr className="border-t-2 border-stone-200">
                      <td colSpan={4} className="pt-3 text-sm font-medium text-stone-700">
                        Total cost per batch
                      </td>
                      <td className="pt-3 text-right text-sm font-semibold text-stone-800">
                        ${batchCost.toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={4} className="pt-1 pb-1 text-sm font-medium text-stone-700">
                        Cost per {recipe.yieldUnit}
                      </td>
                      <td className="pt-1 pb-1 text-right text-sm font-semibold text-stone-800">
                        ${unitCost.toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Warning note — only shown when some costs are missing */}
                {anyMissingCost && (
                  <p className="text-xs text-amber-600 mt-4 pt-3 border-t border-amber-100">
                    Some ingredient costs are missing — costs may be incomplete
                  </p>
                )}

              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
