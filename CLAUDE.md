# Project: Bakery Inventory App

## Project Brief
A web application for a bakery owner to manage business inventory.
Works on desktop and mobile. Features: ingredient tracking, finished
goods tracking, restocking records, and low-stock alerts.
Stack: Next.js + Firebase.

## Tech Stack
- Frontend/Framework: Next.js 14
- Database: Firebase Firestore
- Hosting: Vercel (for demos), Firebase Hosting (for production)
- Styling: Tailwind CSS

## Developer Context
- I am still learning React, Next.js, and Firebase
- Please explain your reasoning when making architectural decisions
- Use plain language when explaining concepts
- Prefer simple, readable code over clever or abstract patterns

## Code Standards
- Use descriptive variable and function names
- Add a comment above any function explaining what it does
- Keep components small and focused on one responsibility

## Styling Guidelines
- Framework: Tailwind CSS
- Design style: Clean, minimal dashboard — similar to Vercel or Linear
- Color palette: Warm neutrals (slate, stone) with one accent color (amber 
  works well for a bakery theme)
- Typography: Simple, readable — default Tailwind font stack is fine
- Mobile-first: Always design for mobile, then scale up to desktop
- Tables: Clean with clear row separation, readable on small screens
- Low stock alerts: Use red/rose tones for warning states
- Avoid: Drop shadows everywhere, gradients, overly decorative elements

## Technical Decisions (Locked In)
- Authentication: None — single user, skip Auth entirely
- Data loading: On-demand fetching — no real-time listeners
- Units: Fixed dropdown, not free text (prevents "lbs" vs "pounds" mismatches)
- Firebase plan: Free Spark tier

## Folder Structure
```
bakery-inventory-app/
├── app/                          # Next.js App Router — each folder = a URL route
│   ├── layout.js                 # Root layout (navbar, global wrappers)
│   ├── page.js                   # Dashboard (low-stock summary)
│   ├── ingredients/
│   │   ├── page.js               # List all ingredients
│   │   └── [id]/page.js          # Edit a single ingredient
│   ├── finished-goods/
│   │   ├── page.js               # List all finished goods
│   │   └── [id]/page.js          # Edit a single finished good
│   └── restocking/
│       └── page.js               # Restocking history + log new restock
│
├── components/                   # Reusable UI pieces
│   ├── Navbar.js
│   ├── InventoryTable.js         # Shared table for ingredients & finished goods
│   ├── LowStockBadge.js          # Red badge shown when stock < threshold
│   └── RestockForm.js            # Form to log a new restock event
│
├── lib/                          # Non-UI logic (no React here)
│   ├── firebase.js               # Firebase app initialization
│   └── firestore.js              # All Firestore read/write functions
│
├── .env.local                    # Firebase API keys — never commit this
├── .gitignore
├── next.config.js
└── package.json
```

## Firebase Data Model

### Collection: `ingredients`
```js
{
  name: "All-Purpose Flour",     // string
  unit: "lbs",                   // string — from fixed dropdown
  currentStock: 24.5,            // number
  lowStockThreshold: 10,         // number — flag when below this
  costPerUnit: 0.89,             // number (optional)
  supplier: "Gordon Food Service", // string (optional)
  updatedAt: Timestamp
}
```

### Collection: `finishedGoods`
```js
{
  name: "Sourdough Loaf",        // string
  unit: "loaves",                // string — from fixed dropdown
  currentStock: 8,               // number
  lowStockThreshold: 5,          // number
  price: 9.00,                   // number — selling price (optional)
  updatedAt: Timestamp
}
```

### Collection: `restockingRecords`
```js
{
  itemId: "abc123",              // Firestore document ID of the item
  itemType: "ingredient",        // "ingredient" or "finishedGood"
  itemName: "All-Purpose Flour", // copied here so history is readable later
  quantityAdded: 50,             // number
  notes: "Weekly delivery",      // string (optional)
  createdAt: Timestamp
}
```

### Fixed Unit Options
`["g", "kg", "oz", "lbs", "ml", "L", "cups", "units", "dozen", "trays"]`