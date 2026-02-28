// ─── What this file does ────────────────────────────────────────────────────
// This file contains all the functions that read from and write to Firestore.
// Think of it as the "data layer" — no UI code lives here, just database logic.
// Components and pages import these functions instead of talking to Firebase directly.
// That way, if we ever change how data is stored, we only update this one file.
// ────────────────────────────────────────────────────────────────────────────

// ─── Imports ─────────────────────────────────────────────────────────────────
// `db` is the connected Firestore instance from our firebase.js setup file.
import { db } from "@/lib/firebase";

// These are the Firestore tools we need:
// - collection: points to a group of documents (like a table)
// - doc:        points to a single document by its ID (like a row)
// - getDoc:     fetches a single document by reference (one row by ID)
// - getDocs:    fetches all documents matching a query
// - addDoc:     adds a new document and lets Firebase generate the ID
// - updateDoc:  updates specific fields in an existing document
// - deleteDoc:  permanently deletes a document
// - serverTimestamp: records the exact server time when a write happens
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  writeBatch,
  increment,
} from "firebase/firestore";

// ─────────────────────────────────────────────────────────────────────────────
// INGREDIENTS
// ─────────────────────────────────────────────────────────────────────────────

// Fetches every ingredient from the database and returns them as a plain array.
// Firestore documents don't include their own ID in the data, so we manually
// attach it to each item as we loop through — you'll need the ID later to
// update or delete a specific ingredient.
export const getIngredients = async () => {
  // Get a reference to the "ingredients" collection in Firestore
  const ingredientsRef = collection(db, "ingredients");

  // Ask Firestore for all the documents in that collection
  const snapshot = await getDocs(ingredientsRef);

  // `snapshot.docs` is an array of document objects. Each has:
  //   - `.id`     → the auto-generated Firestore ID (e.g. "abc123")
  //   - `.data()` → a function that returns the actual field values as an object
  // We combine both into one clean object per ingredient.
  const ingredients = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(), // spreads in all fields: name, unit, currentStock, etc.
  }));

  console.log(`Fetched ${ingredients.length} ingredients`);
  return ingredients;
};

// Adds a new ingredient document to the database.
// `data` should be an object with fields like: { name, unit, currentStock, lowStockThreshold }
// We automatically add an `updatedAt` timestamp so we know when it was created.
// Returns the new document reference, which includes the auto-generated ID.
export const addIngredient = async (data) => {
  // Get a reference to the "ingredients" collection
  const ingredientsRef = collection(db, "ingredients");

  // Write a new document. Firebase auto-generates a unique ID for it.
  // We spread in the data the caller passed, then add our timestamp on top.
  const docRef = await addDoc(ingredientsRef, {
    ...data,
    updatedAt: serverTimestamp(), // set by the server, not the browser clock
  });

  console.log(`Added ingredient with ID: ${docRef.id}`);
  return docRef;
};

// Updates the stock level of a specific ingredient.
// `id` is the Firestore document ID (e.g. "abc123").
// `newStock` is the updated quantity as a number (e.g. 14.5).
// Only `currentStock` and `updatedAt` are changed — all other fields stay the same.
export const updateIngredientStock = async (id, newStock) => {
  // `doc(db, "ingredients", id)` builds a reference to the exact document we want.
  // It's like saying: in this database, in the ingredients collection, find the
  // document with this specific ID.
  const ingredientRef = doc(db, "ingredients", id);

  // `updateDoc` only writes the fields we specify — it won't touch the rest.
  // This is different from "setDoc with merge: false" which would overwrite everything.
  await updateDoc(ingredientRef, {
    currentStock: newStock,
    updatedAt: serverTimestamp(),
  });

  console.log(`Updated stock for ingredient ${id} to ${newStock}`);
};

// Updates all editable fields on an existing ingredient document.
// `id` is the Firestore document ID.
// `data` is an object with the fields to update: { name, unit, currentStock, lowStockThreshold }
// Unlike updateIngredientStock (which only touches stock), this function
// can update any combination of fields in one write.
export const updateIngredient = async (id, data) => {
  const ingredientRef = doc(db, "ingredients", id);

  await updateDoc(ingredientRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });

  console.log(`Updated ingredient ${id}`, data);
};

// Permanently deletes an ingredient from the database.
// `id` is the Firestore document ID (e.g. "abc123").
// Warning: this cannot be undone. There is no recycle bin in Firestore.
export const deleteIngredient = async (id) => {
  // Build a reference to the exact document we want to remove
  const ingredientRef = doc(db, "ingredients", id);

  // Delete it
  await deleteDoc(ingredientRef);

  console.log(`Deleted ingredient ${id}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// FINISHED GOODS
// ─────────────────────────────────────────────────────────────────────────────

// Fetches every finished good from the database and returns them as a plain array.
export const getFinishedGoods = async () => {
  const finishedGoodsRef = collection(db, "finishedGoods");
  const snapshot = await getDocs(finishedGoodsRef);

  const finishedGoods = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));

  console.log(`Fetched ${finishedGoods.length} finished goods`);
  return finishedGoods;
};

// Adds a new finished good to the database.
// `data` should include: { name, unit, currentStock, lowStockThreshold, price }
export const addFinishedGood = async (data) => {
  const finishedGoodsRef = collection(db, "finishedGoods");

  const docRef = await addDoc(finishedGoodsRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });

  console.log(`Added finished good with ID: ${docRef.id}`);
  return docRef;
};

// Updates all editable fields on an existing finished good document.
// `data` can include: { name, unit, currentStock, lowStockThreshold, price }
export const updateFinishedGood = async (id, data) => {
  const finishedGoodRef = doc(db, "finishedGoods", id);

  await updateDoc(finishedGoodRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });

  console.log(`Updated finished good ${id}`, data);
};

// Permanently deletes a finished good from the database.
export const deleteFinishedGood = async (id) => {
  const finishedGoodRef = doc(db, "finishedGoods", id);
  await deleteDoc(finishedGoodRef);
  console.log(`Deleted finished good ${id}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTOCKING RECORDS
// ─────────────────────────────────────────────────────────────────────────────

// Legacy — restocking page removed. These records exist for historical reference only.
// Fetches all restocking records, sorted newest-first.
// Unlike the other fetch functions, this uses a Firestore `query` with an
// `orderBy` constraint. Without it, results come back in an arbitrary order.
// `query()` builds the instructions; `getDocs()` executes them.
export const getRestockingRecords = async () => {
  const recordsRef = collection(db, "restockingRecords");
  const q = query(recordsRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  const records = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));

  console.log(`Fetched ${records.length} restocking records`);
  return records;
};

// Adds a new restocking record AND increments the item's currentStock in one
// atomic batch write. `data` should include: { itemId, itemType, itemName, quantityAdded, notes }
//
// Why a batch?
// A batch write guarantees that both operations succeed or both fail together.
// Without it, a network hiccup could write the log entry but skip the stock
// update (or vice versa), leaving the data inconsistent.
//
// Why increment() instead of reading current stock and adding to it?
// increment(n) is a server-side atomic instruction — Firestore adds n to
// whatever the current value is, without a round-trip read. If two restock
// events land simultaneously, both increments are applied correctly. A
// read-then-write approach would cause a race condition where the second
// write overwrites the first, silently losing one of the restocks.
export const addRestockingRecord = async (data) => {
  // Determine which collection holds this item based on its type.
  // "ingredient" → "ingredients", "finishedGood" → "finishedGoods"
  const itemCollection = data.itemType === "ingredient" ? "ingredients" : "finishedGoods";

  // Build references to the two documents we need to write.
  // `doc(collection(...))` generates a new auto-ID reference without writing
  // anything yet — we need the ref up front so we can hand it to the batch.
  const newRecordRef = doc(collection(db, "restockingRecords"));
  const itemRef      = doc(db, itemCollection, data.itemId);

  // Create an empty batch — a container that holds multiple write operations.
  const batch = writeBatch(db);

  // Operation 1: Write the new restocking record document.
  // We use batch.set() here (not addDoc) because we pre-generated the ref above.
  batch.set(newRecordRef, {
    ...data,
    createdAt: serverTimestamp(),
  });

  // Operation 2: Atomically add quantityAdded to the item's current stock.
  // increment() tells Firestore "add this number to the existing value on the
  // server" — no read needed, no race condition possible.
  batch.update(itemRef, {
    currentStock: increment(data.quantityAdded),
    updatedAt: serverTimestamp(),
  });

  // Send both operations to Firestore in a single network request.
  // If either write fails, neither is applied.
  await batch.commit();

  console.log(`Logged restock and updated stock for ${data.itemType} ${data.itemId} (+${data.quantityAdded})`);
  return newRecordRef;
};

// ─────────────────────────────────────────────────────────────────────────────
// RECIPES
// ─────────────────────────────────────────────────────────────────────────────

// Fetches all active recipes, sorted newest-first.
// We fetch all recipes and filter client-side rather than using a Firestore
// `where` clause, because combining `where` + `orderBy` on different fields
// requires a composite index in Firebase. For a small dataset this is fine,
// and avoids manual index setup in the console.
export const getRecipes = async () => {
  const recipesRef = collection(db, "recipes");
  const q = query(recipesRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  const allRecipes = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));

  // Filter out archived recipes in JavaScript after the fetch.
  const activeRecipes = allRecipes.filter((r) => r.status === "active");

  console.log(`Fetched ${activeRecipes.length} active recipes`);
  return activeRecipes;
};

// Fetches a single recipe by its Firestore document ID.
// Uses getDoc() (singular) rather than getDocs() because we already know
// the exact document path — no query needed.
// Returns null if the document doesn't exist.
export const getRecipeById = async (id) => {
  const recipeRef = doc(db, "recipes", id);
  const snapshot = await getDoc(recipeRef);

  if (!snapshot.exists()) {
    console.warn(`Recipe ${id} not found`);
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
};

// Adds a new recipe document.
// `data` should include: { name, finishedGoodId, finishedGoodName,
//   yieldQuantity, yieldUnit, ingredients: [...] }
// `status` and timestamps are set here, not by the caller.
export const addRecipe = async (data) => {
  const recipesRef = collection(db, "recipes");

  const docRef = await addDoc(recipesRef, {
    ...data,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log(`Added recipe with ID: ${docRef.id}`);
  return docRef;
};

// Updates an existing recipe's fields.
// `data` can include any combination of: { name, finishedGoodId,
//   finishedGoodName, yieldQuantity, yieldUnit, ingredients }
// Note: before calling this, the caller should confirm no open work orders
// reference this recipe (enforced in Phase D when work orders are built).
export const updateRecipe = async (id, data) => {
  const recipeRef = doc(db, "recipes", id);

  await updateDoc(recipeRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });

  console.log(`Updated recipe ${id}`, data);
};

// Archives a recipe by setting its status to "archived".
// We never hard-delete recipes because work orders (Phase E) will reference
// them by ID — deleting a recipe would orphan those records.
export const archiveRecipe = async (id) => {
  const recipeRef = doc(db, "recipes", id);

  await updateDoc(recipeRef, {
    status: "archived",
    updatedAt: serverTimestamp(),
  });

  console.log(`Archived recipe ${id}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// DEMAND PLANS
// ─────────────────────────────────────────────────────────────────────────────

// Fetches all demand plans, sorted newest-first.
// Returns all plans regardless of status — the page filters by status
// in JavaScript so we can toggle between "open only" and "show all"
// without an extra Firestore round-trip.
export const getDemandPlans = async () => {
  const plansRef = collection(db, "demandPlans");
  const q = query(plansRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  const plans = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));

  console.log(`Fetched ${plans.length} demand plans`);
  return plans;
};

// Creates a new demand plan document (now used for MTO special orders).
// `data` should include all calculated snapshot fields so the plan stays
// accurate even if the underlying recipe or stock levels change later:
// { orderType, customerName, customerContact, pickupDateTime, paymentNotes,
//   finishedGoodId, finishedGoodName, targetQuantity, currentStock,
//   shortfall, batchesRequired, recipeId, recipeName, recipeYield,
//   status, notes, createdBy }
export const addDemandPlan = async (data) => {
  const plansRef = collection(db, "demandPlans");

  const docRef = await addDoc(plansRef, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log(`Added demand plan with ID: ${docRef.id}`);
  return docRef;
};

// Updates fields on an existing demand plan.
// Used when editing a plan's target quantity, required-by date, or notes.
// `data` can include any combination of the plan's editable fields.
export const updateDemandPlan = async (id, data) => {
  const planRef = doc(db, "demandPlans", id);

  await updateDoc(planRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });

  console.log(`Updated demand plan ${id}`, data);
};

// Soft-cancels a demand plan by setting its status to "cancelled".
// We never hard-delete demand plans because they are part of the
// production history record — cancelled plans are shown in muted style.
export const cancelDemandPlan = async (id) => {
  const planRef = doc(db, "demandPlans", id);

  await updateDoc(planRef, {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });

  console.log(`Cancelled demand plan ${id}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// WORK ORDERS
// ─────────────────────────────────────────────────────────────────────────────

// Fetches all work orders sorted by scheduledStart ascending — soonest first.
// This is a task list, not a history log, so we show upcoming work at the top.
// scheduledStart is stored as a datetime-local string ("YYYY-MM-DDThh:mm"),
// which sorts correctly lexicographically because of the ISO format.
export const getWorkOrders = async () => {
  const ref = collection(db, "workOrders");
  const q = query(ref, orderBy("scheduledStart", "asc"));
  const snapshot = await getDocs(q);

  const orders = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));

  console.log(`Fetched ${orders.length} work orders`);
  return orders;
};

// Fetches a single work order by its Firestore document ID.
// Returns null if the document doesn't exist.
export const getWorkOrderById = async (id) => {
  const ref = doc(db, "workOrders", id);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    console.warn(`Work order ${id} not found`);
    return null;
  }

  return { id: snapshot.id, ...snapshot.data() };
};

// Creates a new work order document.
// `data` should include all snapshot fields so the order stays accurate
// even if the underlying recipe changes later:
// { demandPlanId, recipeId, recipeName, finishedGoodId, finishedGoodName,
//   batchesOrdered, batchesActual, totalYield, recipeYield,
//   scheduledStart, dueBy, status, ingredientsRequired,
//   ingredientsSufficient, insufficientIngredients, notes, createdBy,
//   startedAt, completedAt }
export const addWorkOrder = async (data) => {
  const ref = collection(db, "workOrders");

  const docRef = await addDoc(ref, {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log(`Added work order with ID: ${docRef.id}`);
  return docRef;
};

// Updates fields on an existing work order.
// Editable fields after creation: batchesActual, totalYield,
// scheduledStart, dueBy, notes, status, startedAt, completedAt.
// Recipe, finishedGood, and batchesOrdered are locked at creation.
export const updateWorkOrder = async (id, data) => {
  const ref = doc(db, "workOrders", id);

  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });

  console.log(`Updated work order ${id}`, data);
};

// Soft-cancels a work order by setting its status to "cancelled".
// We never hard-delete work orders — they are part of the production record.
export const cancelWorkOrder = async (id) => {
  const ref = doc(db, "workOrders", id);

  await updateDoc(ref, {
    status: "cancelled",
    updatedAt: serverTimestamp(),
  });

  console.log(`Cancelled work order ${id}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION
// ─────────────────────────────────────────────────────────────────────────────

// Executes a completed work order in a single atomic batch write.
// Takes the full work order object and the email of the user completing it.
//
// The batch contains N + 2 or N + 3 operations (N = number of ingredients):
//   1. Decrement each ingredient's currentStock by its totalRequired amount
//   2. Increment the finished good's currentStock by the work order's totalYield
//        — SKIPPED for orderType "MTO": the product goes directly to the customer,
//          not onto the shelf, so finished goods inventory should not change.
//   3. Update the work order: status → "complete", completedAt → now
//   4. Write a new productionRecord as a permanent audit log entry
//
// Why this specific order?
//   It mirrors the physical production sequence: consume inputs → produce output
//   → close the job → log the event. Firestore applies all operations atomically
//   regardless of order, but this sequence makes the code readable.
//
// Why increment() instead of read-then-write?
//   increment(-totalRequired) is a server-side atomic instruction. If two work
//   orders for the same ingredient complete simultaneously, both decrements apply
//   correctly. A read-then-write would race and silently lose one deduction.
//
// Returns the auto-generated production record document ID.
export const executeWorkOrder = async (workOrder, producedBy) => {
  const batch = writeBatch(db);

  // ── 1. Deduct each ingredient ─────────────────────────────────────────────
  // We loop over ingredientsRequired (snapshot stored at work order creation)
  // rather than re-reading the live recipe, so the deduction matches exactly
  // what was planned — even if the recipe was edited after the order was created.
  //
  // IMPORTANT: we use ing.quantity * workOrder.batchesActual, NOT ing.totalRequired.
  // ing.totalRequired was snapshotted at creation using batchesOrdered. If the
  // baker later edited batchesActual (e.g. changed 3 batches to 4), the snapshot
  // would still say 3 × quantity — causing an under-deduction. batchesActual is
  // always the authoritative "what we actually made" count.
  for (const ing of workOrder.ingredientsRequired) {
    const ingredientRef = doc(db, "ingredients", ing.ingredientId);
    batch.update(ingredientRef, {
      currentStock: increment(-(ing.quantity * workOrder.batchesActual)),
      updatedAt:    serverTimestamp(),
    });
  }

  // ── 2. Add to finished good stock (MTS only) ──────────────────────────────
  // MTO products go straight to the customer, so we skip this for those orders.
  // undefined orderType is treated as MTS to preserve behaviour for existing orders.
  if (workOrder.orderType !== "MTO") {
    const finishedGoodRef = doc(db, "finishedGoods", workOrder.finishedGoodId);
    batch.update(finishedGoodRef, {
      currentStock: increment(workOrder.totalYield),
      updatedAt:    serverTimestamp(),
    });
  }

  // ── 3. Mark the work order complete ──────────────────────────────────────
  const workOrderRef = doc(db, "workOrders", workOrder.id);
  batch.update(workOrderRef, {
    status:      "complete",
    completedAt: serverTimestamp(),
    updatedAt:   serverTimestamp(),
  });

  // ── 4. Write production record ────────────────────────────────────────────
  // Generate the ref before committing — batch.set() requires a pre-built ref
  // because addDoc() writes immediately and can't be deferred into a batch.
  const productionRecordRef = doc(collection(db, "productionRecords"));
  batch.set(productionRecordRef, {
    workOrderId:      workOrder.id,
    recipeId:         workOrder.recipeId,
    recipeName:       workOrder.recipeName,
    finishedGoodId:   workOrder.finishedGoodId,
    finishedGoodName: workOrder.finishedGoodName,
    batchesProduced:  workOrder.batchesActual,
    totalYield:       workOrder.totalYield,
    // Snapshot ingredientsRequired as consumed amounts so the record is
    // self-contained and readable without cross-referencing the recipe.
    ingredientsConsumed: workOrder.ingredientsRequired.map((ing) => ({
      ingredientId:   ing.ingredientId,
      ingredientName: ing.ingredientName,
      quantity:       ing.quantity,       // per-batch amount from the recipe snapshot
      unit:           ing.unit,
      totalRequired:  ing.quantity * workOrder.batchesActual, // actual amount consumed
    })),
    producedBy,
    createdAt: serverTimestamp(),
  });

  // Commit all operations as a single atomic write.
  // Either all four succeed or none do — no partial state possible.
  await batch.commit();

  console.log(`Executed work order ${workOrder.id} → production record ${productionRecordRef.id}`);
  return productionRecordRef.id;
};

// Creates a new work order pre-populated from a demand plan, and atomically
// marks the demand plan as "fulfilled" — both in a single writeBatch so
// neither can succeed without the other.
//
// The function fetches the full recipe and current ingredient stock levels in
// parallel so it can build a complete snapshot (ingredientsRequired with
// calculated totalRequired, ingredientsSufficient, insufficientIngredients).
//
// scheduledStart is left blank — the user fills it in on the work orders page.
// dueBy defaults to 8 AM on the demand plan's requiredBy date so the work
// order already has a sensible deadline the baker can adjust if needed.
//
// Returns the new work order's Firestore document ID.
export const createWorkOrderFromDemandPlan = async (demandPlan, currentUserEmail) => {
  // Fetch the full recipe and current ingredient stock in parallel.
  // We need the recipe for yieldQuantity and the ingredients array;
  // we need live stock to calculate ingredientsSufficient.
  const [recipe, ingredients] = await Promise.all([
    getRecipeById(demandPlan.recipeId),
    getIngredients(),
  ]);

  if (!recipe) {
    throw new Error(`Recipe "${demandPlan.recipeId}" not found — it may have been archived.`);
  }

  const batches = demandPlan.batchesRequired;

  // Build the ingredientsRequired snapshot: one entry per recipe ingredient
  // with totalRequired calculated for the number of batches being ordered.
  const ingredientsRequired = recipe.ingredients.map((ing) => ({
    ingredientId:   ing.ingredientId,
    ingredientName: ing.ingredientName,
    quantity:       ing.quantity,          // per-batch amount from the recipe
    unit:           ing.unit,
    totalRequired:  batches * ing.quantity, // total for all batches
  }));

  // Cross-reference current stock to determine sufficiency.
  const ingredientCheck = ingredientsRequired.map((ing) => {
    const currentStock = ingredients.find((i) => i.id === ing.ingredientId)?.currentStock ?? 0;
    const sufficient   = currentStock >= ing.totalRequired;
    return {
      ...ing,
      sufficient,
      shortfall: sufficient ? 0 : ing.totalRequired - currentStock,
    };
  });

  const ingredientsSufficient   = ingredientCheck.every((ic) => ic.sufficient);
  const insufficientIngredients = ingredientCheck
    .filter((ic) => !ic.sufficient)
    .map(({ ingredientName, shortfall, unit }) => ({ ingredientName, shortfall, unit }));

  // dueBy: use the customer's pickup datetime directly.
  // pickupDateTime is already a full "YYYY-MM-DDThh:mm" string — no conversion needed.
  // The baker can still adjust it on the /work-orders page before starting.
  const dueBy = demandPlan.pickupDateTime || "";

  // Pre-generate the work order ref so batch.set() can use it.
  // (addDoc() writes immediately and can't be deferred into a batch.)
  const workOrderRef  = doc(collection(db, "workOrders"));
  const demandPlanRef = doc(db, "demandPlans", demandPlan.id);

  const batch = writeBatch(db);

  // Operation 1: Create the work order document.
  // customerName, orderType, and specialOrderId are passed through from the
  // demand plan so the work orders page can display the MTO badge and context.
  batch.set(workOrderRef, {
    demandPlanId:          demandPlan.id,
    specialOrderId:        demandPlan.id,
    orderType:             demandPlan.orderType     ?? "MTS",
    customerName:          demandPlan.customerName  ?? "",
    recipeId:              demandPlan.recipeId,
    recipeName:            demandPlan.recipeName,
    finishedGoodId:        demandPlan.finishedGoodId,
    finishedGoodName:      demandPlan.finishedGoodName,
    batchesOrdered:        batches,
    batchesActual:         batches,   // default; baker can adjust before completing
    totalYield:            batches * recipe.yieldQuantity,
    recipeYield:           recipe.yieldQuantity,
    scheduledStart:        "",        // intentionally blank — user sets this on /work-orders
    dueBy,
    status:                "planned",
    ingredientsRequired,
    ingredientsSufficient,
    insufficientIngredients,
    notes:                 "",
    createdBy:             currentUserEmail,
    startedAt:             null,
    completedAt:           null,
    createdAt:             serverTimestamp(),
    updatedAt:             serverTimestamp(),
  });

  // Operation 2: Mark the demand plan as fulfilled.
  // Atomic — if the work order write fails, the plan stays "open".
  batch.update(demandPlanRef, {
    status:    "fulfilled",
    updatedAt: serverTimestamp(),
  });

  await batch.commit();

  console.log(`Created work order ${workOrderRef.id} from demand plan ${demandPlan.id}`);
  return workOrderRef.id;
};

// ─────────────────────────────────────────────────────────────────────────────
// SALES
// ─────────────────────────────────────────────────────────────────────────────

// Fetches all sales records, newest first.
// These are append-only — no update or delete functions are provided.
// Sales history should never be modified after recording.
export const getSalesRecords = async () => {
  const ref = collection(db, "salesRecords");
  const q = query(ref, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  const records = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));

  console.log(`Fetched ${records.length} sales records`);
  return records;
};

// Records a sale and atomically deducts the sold quantity from the finished
// good's currentStock in a single writeBatch.
//
// `data` should include:
//   { finishedGoodId, finishedGoodName, quantitySold, pricePerUnit,
//     totalRevenue, notes, soldBy }
//
// Why a batch?
// A batch guarantees both the stock deduction and the sales record write
// succeed together or fail together. Without it, a network error could
// record the sale without deducting stock (phantom revenue) or deduct stock
// without recording the sale (silent inventory shrinkage).
//
// Why increment(-quantitySold) instead of read-then-write?
// increment() is server-side and atomic. Multiple simultaneous sales of
// the same item each deduct correctly. A read-then-write would race and the
// second write would overwrite the first, silently losing a deduction.
export const addSaleRecord = async (data) => {
  const saleRecordRef   = doc(collection(db, "salesRecords"));
  const finishedGoodRef = doc(db, "finishedGoods", data.finishedGoodId);

  const batch = writeBatch(db);

  // Operation 1: Write the sales record document.
  // Pre-generated ref required because addDoc() writes immediately
  // and can't be deferred into a batch.
  batch.set(saleRecordRef, {
    ...data,
    createdAt: serverTimestamp(),
  });

  // Operation 2: Deduct the sold quantity from the finished good's stock.
  // increment(-n) is a server-side atomic subtract — no round-trip read needed.
  batch.update(finishedGoodRef, {
    currentStock: increment(-data.quantitySold),
    updatedAt:    serverTimestamp(),
  });

  await batch.commit();

  console.log(`Recorded sale of ${data.quantitySold} ${data.finishedGoodName} → stock deducted`);
  return saleRecordRef;
};

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION RECORDS
// ─────────────────────────────────────────────────────────────────────────────

// Fetches all production records, newest first.
// These are append-only — no update or delete functions are provided.
// The production history should never be modified after the fact.
export const getProductionRecords = async () => {
  const ref = collection(db, "productionRecords");
  const q = query(ref, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  const records = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));

  console.log(`Fetched ${records.length} production records`);
  return records;
};

// ─────────────────────────────────────────────────────────────────────────────
// PURCHASING
// ─────────────────────────────────────────────────────────────────────────────

// Fetches all purchase orders, newest first.
// POs are sorted by creation date descending so the most recent order is at the top.
export const getPurchaseOrders = async () => {
  const ref = collection(db, "purchaseOrders");
  const q = query(ref, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  const orders = snapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));

  console.log(`Fetched ${orders.length} purchase orders`);
  return orders;
};

// Creates a new purchase order document with status "draft".
// `data` should include the full snapshot:
// { planningDateRange, items, workOrdersIncluded, notes, createdBy }
// Items array shape per element:
// { ingredientId, ingredientName, unit, currentStock, safetyStock,
//   totalRequired, netRequired, orderedQuantity, receivedQuantity: 0 }
export const addPurchaseOrder = async (data) => {
  const ref = collection(db, "purchaseOrders");

  const docRef = await addDoc(ref, {
    ...data,
    status:    "draft",
    sentAt:    null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log(`Added purchase order with ID: ${docRef.id}`);
  return docRef;
};

// Updates fields on an existing purchase order.
// Automatically adds sentAt when status is changed to "sent",
// so the page doesn't need to import serverTimestamp directly.
export const updatePurchaseOrder = async (id, data) => {
  const ref = doc(db, "purchaseOrders", id);

  const writeData = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  // Track when the PO was sent to the supplier.
  if (data.status === "sent") {
    writeData.sentAt = serverTimestamp();
  }

  await updateDoc(ref, writeData);

  console.log(`Updated purchase order ${id}`, data);
};

// Hard-deletes a purchase order document.
// A safety check prevents accidental deletion of in-progress orders —
// only draft POs may be deleted. Sent/partial/complete POs are permanent records.
export const deletePurchaseOrder = async (id, status) => {
  if (status !== "draft") {
    throw new Error(
      `Purchase order ${id} cannot be deleted because its status is "${status}". Only draft orders may be deleted.`
    );
  }

  const ref = doc(db, "purchaseOrders", id);
  await deleteDoc(ref);

  console.log(`Deleted draft purchase order ${id}`);
};

// Receives goods against a purchase order in a single atomic batch write.
// `updatedItems` is the full items array with receivedQuantity filled in for each line.
//
// The batch contains N + 1 operations (N = number of items):
//   1. Increment each ingredient's currentStock by its receivedQuantity
//   2. Update the PO: replace items array, set status to "complete" or "partial"
//
// Status logic:
//   "complete" — every item's receivedQuantity >= its orderedQuantity
//   "partial"  — at least one item is short or undelivered
//
// Returns void. The page re-fetches POs after this call.
export const receivePurchaseOrder = async (poId, updatedItems, currentUserEmail) => {
  const batch = writeBatch(db);

  // ── 1. Increment stock for each received item ──────────────────────────────
  // We skip items with receivedQuantity === 0 (not received at all — no stock change).
  // increment() is server-side atomic: safe if multiple receipts run concurrently.
  for (const item of updatedItems) {
    if (item.receivedQuantity > 0) {
      const ingredientRef = doc(db, "ingredients", item.ingredientId);
      batch.update(ingredientRef, {
        currentStock: increment(item.receivedQuantity),
        updatedAt:    serverTimestamp(),
      });
    }
  }

  // ── 2. Update the purchase order ───────────────────────────────────────────
  // Overwrite the items array with the received quantities filled in.
  // Determine completion status: fully received = "complete", otherwise "partial".
  const isComplete = updatedItems.every(
    (item) => item.receivedQuantity >= item.orderedQuantity
  );

  const poRef = doc(db, "purchaseOrders", poId);
  batch.update(poRef, {
    items:      updatedItems,
    status:     isComplete ? "complete" : "partial",
    receivedBy: currentUserEmail,
    updatedAt:  serverTimestamp(),
  });

  await batch.commit();

  console.log(
    `Received goods for PO ${poId} — status: ${isComplete ? "complete" : "partial"}`
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// END OF DAY
// ─────────────────────────────────────────────────────────────────────────────

// Fetches all end-of-day reconciliation records, newest first.
export const getEndOfDayRecords = async () => {
  const ref = collection(db, "endOfDayRecords");
  const q   = query(ref, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Writes all end-of-day reconciliation rows as a single atomic batch:
//   - Decrements the fresh finished good's stock for every row
//   - Increments the linked day-old product's stock for "transferToDayOld" rows
//   - Creates one endOfDayRecord audit document per row
// All operations across all rows commit together — all succeed or none do.
export const addEndOfDayRecords = async (records, currentUserEmail) => {
  const batch = writeBatch(db);

  for (const record of records) {

    // ── 1. Decrement the fresh finished good ───────────────────────────────
    const freshRef = doc(db, "finishedGoods", record.finishedGoodId);
    batch.update(freshRef, {
      currentStock: increment(-record.quantity),
      updatedAt:    serverTimestamp(),
    });

    // ── 2. Increment the day-old product (transfer rows only) ──────────────
    if (record.action === "transferToDayOld" && record.dayOldFinishedGoodId) {
      const dayOldRef = doc(db, "finishedGoods", record.dayOldFinishedGoodId);
      batch.update(dayOldRef, {
        currentStock: increment(record.quantity),
        updatedAt:    serverTimestamp(),
      });
    }

    // ── 3. Write the audit record ──────────────────────────────────────────
    // doc(collection(...)) generates a new auto-ID ref usable in a batch.
    const recordRef = doc(collection(db, "endOfDayRecords"));
    batch.set(recordRef, {
      date:                   record.date,
      finishedGoodId:         record.finishedGoodId,
      finishedGoodName:       record.finishedGoodName,
      action:                 record.action,
      quantity:               record.quantity,
      dayOldFinishedGoodId:   record.action === "transferToDayOld"
                                ? record.dayOldFinishedGoodId   : null,
      dayOldFinishedGoodName: record.action === "transferToDayOld"
                                ? record.dayOldFinishedGoodName : null,
      notes:                  record.notes || "",
      recordedBy:             currentUserEmail || "",
      createdAt:              serverTimestamp(),
    });
  }

  await batch.commit();
  console.log(`End of day recorded: ${records.length} item(s)`);
};

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY PLANNING
// ─────────────────────────────────────────────────────────────────────────────

// Fetches all weekly template documents (one per finished good / recipe pair).
export const getWeeklyTemplates = async () => {
  const snapshot = await getDocs(collection(db, "weeklyTemplates"));
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Upserts a weekly template for one finished good.
// Uses the finishedGoodId as the Firestore document ID so the same good
// always maps to the same template doc — setDoc overwrites if it exists,
// creates if it doesn't. This avoids a query-then-write round trip.
export const saveWeeklyTemplate = async (finishedGoodId, data) => {
  const ref = doc(db, "weeklyTemplates", finishedGoodId);
  await setDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
  console.log(`Saved weekly template for finished good ${finishedGoodId}`);
};

// Fetches all saved weekly plans, newest first.
export const getWeeklyPlans = async () => {
  const q = query(collection(db, "weeklyPlans"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
};

// Generates all work orders for a week in a single atomic batch write.
//
// Steps:
//   1. addDoc the weeklyPlan → get its ID (needed on every work order)
//   2. writeBatch N work orders (one per product per non-zero day)
//   3. batch.update the plan with the final work order count + "generated" status
//   4. batch.commit() — all succeed or none do
//
// Work orders match the shape created by createWorkOrderFromDemandPlan so the
// existing /work-orders page renders them without any changes.
//
// Returns { planId, count } so the page can display a success summary.
export const generateWorkOrdersForWeek = async (
  weeklyPlan,
  recipes,
  ingredients,
  currentUserEmail
) => {
  const DAYS_ORDER = [
    "monday", "tuesday", "wednesday", "thursday",
    "friday", "saturday", "sunday",
  ];

  // ── 1. Save the plan document first to get its Firestore ID ────────────────
  const planRef = await addDoc(collection(db, "weeklyPlans"), {
    weekStartDate:       weeklyPlan.weekStartDate,
    weekLabel:           weeklyPlan.weekLabel,
    status:              "draft",
    items:               weeklyPlan.items,
    workOrdersGenerated: 0,       // updated in the batch below
    createdBy:           currentUserEmail || "",
    createdAt:           serverTimestamp(),
  });
  const planId = planRef.id;

  // ── 2. Build and batch all work orders ─────────────────────────────────────
  const batch = writeBatch(db);
  let count   = 0;

  // Parse the Monday date at noon local time to prevent timezone rollback.
  // A bare "YYYY-MM-DD" string parsed by new Date() is treated as midnight UTC,
  // which can land on Sunday in negative-UTC-offset zones. Noon avoids that.
  const monday = new Date(`${weeklyPlan.weekStartDate}T12:00:00`);

  for (const item of weeklyPlan.items) {
    const recipe = recipes.find((r) => r.id === item.recipeId);
    if (!recipe) continue; // skip if recipe was archived after the template was saved

    for (let i = 0; i < DAYS_ORDER.length; i++) {
      const day = DAYS_ORDER[i];
      const qty = parseFloat(item.quantities[day]) || 0;
      if (qty === 0) continue; // no production planned this day

      const batches = Math.ceil(qty / item.recipeYield);

      // Compute this day's date string ("YYYY-MM-DD") from the Monday anchor.
      const dayDate = new Date(monday);
      dayDate.setDate(dayDate.getDate() + i);
      const yyyy   = dayDate.getFullYear();
      const mm     = String(dayDate.getMonth() + 1).padStart(2, "0");
      const dd     = String(dayDate.getDate()).padStart(2, "0");
      const dateStr = `${yyyy}-${mm}-${dd}`;

      // Build the per-ingredient snapshot — same shape as createWorkOrderFromDemandPlan.
      const ingredientsRequired = recipe.ingredients.map((ing) => ({
        ingredientId:   ing.ingredientId,
        ingredientName: ing.ingredientName,
        unit:           ing.unit,
        quantity:       ing.quantity,          // per-batch amount from the recipe
        totalRequired:  batches * ing.quantity, // total across all batches
      }));

      // Cross-reference current stock for sufficiency flags.
      const ingredientCheck = ingredientsRequired.map((ing) => {
        const currentStock = ingredients.find((i) => i.id === ing.ingredientId)?.currentStock ?? 0;
        const sufficient   = currentStock >= ing.totalRequired;
        return { ...ing, sufficient, shortfall: sufficient ? 0 : ing.totalRequired - currentStock };
      });
      const ingredientsSufficient = ingredientCheck.every((ic) => ic.sufficient);
      const insufficientIngredients = ingredientCheck
        .filter((ic) => !ic.sufficient)
        .map(({ ingredientName, shortfall, unit }) => ({ ingredientName, shortfall, unit }));

      const woRef = doc(collection(db, "workOrders"));
      batch.set(woRef, {
        weeklyPlanId:           planId,
        planDay:                day,
        orderType:              "MTS",
        customerName:           "",
        specialOrderId:         "",
        recipeId:               item.recipeId,
        recipeName:             item.recipeName,
        finishedGoodId:         item.finishedGoodId,
        finishedGoodName:       item.finishedGoodName,
        batchesOrdered:         batches,
        batchesActual:          batches,         // baker can adjust before executing
        recipeYield:            item.recipeYield,
        totalYield:             qty,
        scheduledStart:         `${dateStr}T06:00`,
        dueBy:                  `${dateStr}T10:00`,
        status:                 "planned",
        ingredientsRequired,
        ingredientsSufficient,
        insufficientIngredients,
        notes:                  "",
        createdBy:              currentUserEmail || "",
        startedAt:              null,
        completedAt:            null,
        createdAt:              serverTimestamp(),
        updatedAt:              serverTimestamp(),
      });

      count++;
    }
  }

  // ── 3. Stamp the plan with the final count and mark as generated ───────────
  batch.update(planRef, {
    workOrdersGenerated: count,
    status: "generated",
  });

  await batch.commit();
  console.log(`Generated ${count} work orders for week ${weeklyPlan.weekStartDate}`);
  return { planId, count };
};
