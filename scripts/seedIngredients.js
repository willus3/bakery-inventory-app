// ─── One-time seed script ─────────────────────────────────────────────────────
// Bulk-inserts a list of ingredients into the Firestore `ingredients` collection.
//
// This uses the Firebase ADMIN SDK (not the client SDK used by the app).
// The difference:
//   - Client SDK: runs in the browser, requires a logged-in user, respects
//     Firestore security rules, authenticates with an API key.
//   - Admin SDK: runs in Node.js, bypasses security rules entirely (superuser),
//     authenticates with a service account private key. Used for scripts,
//     migrations, and server-side jobs — never for browser code.
//
// Prerequisites:
//   1. npm install firebase-admin
//   2. Download your service account key from Firebase Console →
//      Project settings → Service accounts → Generate new private key
//   3. Save the downloaded file as serviceAccountKey.json in the project root
//
// Run with:
//   node scripts/seedIngredients.js
// ─────────────────────────────────────────────────────────────────────────────

const admin = require("firebase-admin");

// Load the service account key from the project root.
// This file contains a private key — it's in .gitignore and must never be committed.
const serviceAccount = require("../serviceAccountKey.json");

// Initialize the Admin SDK with the service account credentials.
// This is the Admin equivalent of initializeApp() in lib/firebase.js,
// but instead of an API key it uses a private key that grants full database access.
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ─── Seed data ────────────────────────────────────────────────────────────────
// Each object matches the `ingredients` collection schema defined in CLAUDE.md.
// Fields: name, unit, currentStock, lowStockThreshold, updatedAt
// costPerUnit and supplier are optional and omitted here.
const ingredients = [
  { name: "All-Purpose Flour",  unit: "lbs", currentStock: 50,  lowStockThreshold: 10 },
  { name: "Bread Flour",        unit: "lbs", currentStock: 30,  lowStockThreshold: 10 },
  { name: "Whole Wheat Flour",  unit: "lbs", currentStock: 20,  lowStockThreshold: 5  },
  { name: "Sugar",              unit: "lbs", currentStock: 25,  lowStockThreshold: 5  },
  { name: "Brown Sugar",        unit: "lbs", currentStock: 15,  lowStockThreshold: 5  },
  { name: "Powdered Sugar",     unit: "lbs", currentStock: 10,  lowStockThreshold: 3  },
  { name: "Salt",               unit: "lbs", currentStock: 10,  lowStockThreshold: 2  },
  { name: "Baking Powder",      unit: "oz",  currentStock: 32,  lowStockThreshold: 8  },
  { name: "Baking Soda",        unit: "oz",  currentStock: 16,  lowStockThreshold: 4  },
  { name: "Active Dry Yeast",   unit: "oz",  currentStock: 16,  lowStockThreshold: 4  },
  { name: "Instant Yeast",      unit: "oz",  currentStock: 8,   lowStockThreshold: 2  },
  { name: "Cocoa Powder",       unit: "lbs", currentStock: 10,  lowStockThreshold: 2  },
  { name: "Cornstarch",         unit: "lbs", currentStock: 5,   lowStockThreshold: 1  },
  { name: "Unsalted Butter",    unit: "lbs", currentStock: 20,  lowStockThreshold: 5  },
  { name: "Eggs",               unit: "units", currentStock: 120, lowStockThreshold: 24 },
  { name: "Whole Milk",         unit: "cups", currentStock: 50,  lowStockThreshold: 12 },
  { name: "Buttermilk",         unit: "cups", currentStock: 20,  lowStockThreshold: 8  },
  { name: "Heavy Cream",        unit: "cups", currentStock: 20,  lowStockThreshold: 8  },
  { name: "Vanilla Extract",    unit: "oz",  currentStock: 16,  lowStockThreshold: 4  },
  { name: "Vegetable Oil",      unit: "cups", currentStock: 20,  lowStockThreshold: 6  },
  { name: "Chocolate Chips",    unit: "lbs", currentStock: 10,  lowStockThreshold: 2  },
  { name: "Walnuts",            unit: "lbs", currentStock: 5,   lowStockThreshold: 1  },
  { name: "Raisins",            unit: "lbs", currentStock: 5,   lowStockThreshold: 1  },
  { name: "Rolled Oats",        unit: "lbs", currentStock: 10,  lowStockThreshold: 2  },
  { name: "Cinnamon",           unit: "oz",  currentStock: 8,   lowStockThreshold: 2  },
  { name: "Sesame Seeds",       unit: "oz",  currentStock: 8,   lowStockThreshold: 2  },
  { name: "Poppy Seeds",        unit: "oz",  currentStock: 4,   lowStockThreshold: 1  },
];

// ─── Seed function ────────────────────────────────────────────────────────────
// Writes each ingredient one at a time in a for...of loop so we can log
// the result of each individual write before moving to the next.
// A batch write would be faster but would only give us one pass/fail for
// all 27 items together — per-item logging is more useful for a seed script.
const seed = async () => {
  console.log(`Starting seed — ${ingredients.length} ingredients to write...\n`);

  let successCount = 0;
  let failCount = 0;

  for (const ingredient of ingredients) {
    try {
      // db.collection().add() is the Admin SDK equivalent of addDoc().
      // Firestore auto-generates the document ID.
      const docRef = await db.collection("ingredients").add({
        ...ingredient,
        // FieldValue.serverTimestamp() works the same way in the Admin SDK
        // as serverTimestamp() does in the client SDK — the Firestore server
        // records the exact time of the write.
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`  + ${ingredient.name.padEnd(22)} → ${docRef.id}`);
      successCount++;

    } catch (err) {
      console.error(`  x ${ingredient.name.padEnd(22)} → FAILED: ${err.message}`);
      failCount++;
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n─────────────────────────────────────────`);
  console.log(`Done: ${successCount} succeeded, ${failCount} failed.`);

  // Exit with code 1 if any writes failed so the shell can detect the error.
  // Exit with code 0 on full success.
  process.exit(failCount > 0 ? 1 : 0);
};

seed();
