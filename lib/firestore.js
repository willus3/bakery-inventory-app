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
// - getDocs:    fetches all documents in a collection
// - addDoc:     adds a new document and lets Firebase generate the ID
// - updateDoc:  updates specific fields in an existing document
// - deleteDoc:  permanently deletes a document
// - serverTimestamp: records the exact server time when a write happens
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
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

// Adds a new restocking record to the permanent log.
// `data` should include: { itemId, itemType, itemName, quantityAdded, notes }
// Records are never updated or deleted — this is an append-only log.
export const addRestockingRecord = async (data) => {
  const recordsRef = collection(db, "restockingRecords");

  const docRef = await addDoc(recordsRef, {
    ...data,
    createdAt: serverTimestamp(),
  });

  console.log(`Added restocking record with ID: ${docRef.id}`);
  return docRef;
};
