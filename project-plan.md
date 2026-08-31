# Yes Chef — recipe & cooking companion app

A static, installable PWA for capturing recipes, browsing/tagging them, and running a hands-free cooking mode with parallel timers.

## 1. Purpose

Capture recipes from web pages, store them in a unified format, and use a cooking mode that shows steps, unified ingredient units, and lets multiple timers run in parallel — usable on phone or tablet while actually cooking.

## 2. Scope

### In scope (v1)
- Browse and search recipes by keyword and by tag (vegetarian, dinner, breakfast, etc.)
- Recipe detail view: ingredients, steps, tags, source link, servings
- Serving-size scaling — default 2 servings, auto-scales all ingredient quantities for any target count
- Cooking mode:
  - Scrollable, snap-to-card step list (not strict linear next/back)
  - Each step: text, highlighted ingredients relevant to that step, mark-done toggle, optional start-timer button
  - Multiple timers can run in parallel, independent of which step is currently in view
  - Persistent timer tray showing all active timers regardless of scroll position
  - Installable as a PWA with a service worker, so timers can alert via notification even when the phone is locked or the app is backgrounded (works reliably on Android/desktop; requires iOS 16.4+ and "Add to Home Screen" on iOS)
- Data storage: Firestore, single user, no auth complexity beyond gating access
- Units unified to metric, except spices which use tsp/tbsp regardless of quantity

### Out of scope (v1) — explicit decisions
- Recipe capture, parsing, and unit translation are **not built into the app**. A separate desktop agent fetches the source URL, parses the page, converts units, and inserts the record directly into Firestore.
- No in-app recipe add/edit form
- No shopping list generation (deferred — nice-to-have for a later version)
- No multi-recipe cooking sessions, e.g. cooking a main + side together with interleaved steps/timers (deferred)
- No recipe notes or ratings
- No multi-user support or shared collections (single user only)

## 3. Firestore record schema

One document per recipe. Fields written by the desktop parsing agent; read-only from the app's perspective.

```json
{
  "id": "auto-generated-doc-id",
  "title": "Spaghetti Carbonara",
  "sourceUrl": "https://example.com/carbonara",
  "sourceName": "Example Kitchen",
  "tags": ["dinner", "italian", "vegetarian"],
  "servings": {
    "base": 2,
    "unit": "people"
  },
  "timing": {
    "prepMinutes": 15,
    "cookMinutes": 20,
    "totalMinutes": 35
  },
  "ingredients": [
    {
      "id": "ing_1",
      "name": "spaghetti",
      "amount": 200,
      "unit": "g",
      "notes": null
    },
    {
      "id": "ing_2",
      "name": "black pepper",
      "amount": 1,
      "unit": "tsp",
      "notes": "freshly ground"
    },
    {
      "id": "ing_3",
      "name": "eggs",
      "amount": 2,
      "unit": "piece",
      "notes": null
    }
  ],
  "steps": [
    {
      "id": "step_1",
      "order": 1,
      "text": "Bring a large pot of salted water to a boil.",
      "timer": { "durationSeconds": 300, "label": "Boil water" },
      "ingredientRefs": []
    },
    {
      "id": "step_2",
      "order": 2,
      "text": "Cook spaghetti until al dente.",
      "timer": { "durationSeconds": 600, "label": "Cook pasta" },
      "ingredientRefs": ["ing_1"]
    }
  ],
  "createdAt": "2026-08-30T12:00:00Z",
  "updatedAt": "2026-08-30T12:00:00Z"
}
```

### Schema rules
- `unit` is a closed enum: `g, kg, ml, l, tsp, tbsp, piece, pinch`. The parsing agent must normalize any source unit into one of these before insert.
- `amount` is always relative to `servings.base`. The app scales every ingredient by `targetServings / servings.base` when the user changes the serving count.
- `timer` is optional per step — omit or set to `null` for steps with no wait time.
- `ingredientRefs` lists which `ingredients[].id` values are relevant to that step, so cooking mode can highlight only what matters for the step currently in view.
- `tags` is a flat array mixing dietary and meal-type labels — no separate taxonomy, filtering just matches against this array.

## 4. Screen flow

```
Browse / search  →  Recipe detail  →  Cooking mode
     ^                                     |
     └─────────── finish / exit ───────────┘
```

- **Browse / search** — keyword search bar, tag filter chips, list/grid of recipe cards. No add/edit entry point (capture is desktop-only).
- **Recipe detail** — servings stepper (default 2, scales ingredients live), full ingredient list, step list preview (read-only), tags, source link. Primary action: "Start cooking."
- **Cooking mode** — scrollable list of step cards with snap-to-card scrolling, current step's relevant ingredients highlighted, mark-done control, optional per-step timer start button, persistent timer tray fixed at the bottom showing all active parallel timers.

## 5. Naming

Chosen name: **Yes Chef** — the kitchen call-and-response acknowledgment used when an instruction is given and confirmed. Fits an app built around following a recipe's steps precisely.

## 6. Implementation plan

### Phase 0 — Foundation
- Set up Firestore project, security rules (single-user gate via Firebase Auth, e.g. anonymous or simple email/password)
- Define and document the schema above as a fixed contract between the desktop agent and the app
- Scaffold the app as an installable PWA: web app manifest, icons, service worker registration

### Phase 1 — Browse & detail
- Recipe list screen: fetch from Firestore, render cards, keyword search (client-side filter to start), tag filter chips
- Recipe detail screen: render ingredients/steps/tags/source, servings stepper with live scaling math

### Phase 2 — Cooking mode core
- Scrollable step-card layout with CSS scroll-snap
- Mark-done state per step (local session state, doesn't need to persist to Firestore for v1)
- Ingredient highlighting per step using `ingredientRefs`

### Phase 3 — Timers
- Per-step timer start button, countdown logic
- Support multiple concurrent timers (independent countdown objects, not a single global timer)
- Persistent timer tray component showing all active timers with remaining time, visible while scrolling
- Service worker + Notifications API integration so timer completion fires an alert even when the app is backgrounded or the screen is locked (test explicitly on iOS as a PWA vs. a browser tab, since behavior differs)

### Phase 4 — Desktop parsing agent (separate track, can run in parallel)
- URL fetch + parse (prioritize schema.org/Recipe markup where present)
- Unit normalization into the closed enum, with spices forced to tsp/tbsp
- Direct Firestore insert matching the schema exactly
- Fallback handling for pages with partial or no structured recipe data

### Phase 5 — Polish
- Handle empty/error states (no recipes, failed Firestore read, etc.)
- Verify PWA installability and offline shell caching
- Test on both phone and tablet form factors

### Deferred for later versions
- Shopping list generation from selected recipes
- Multi-recipe cooking sessions (interleaved steps/timers across recipes)
- Recipe notes and ratings
- Multi-user support
