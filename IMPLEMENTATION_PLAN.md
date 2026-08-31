# Yes Chef v1 — Implementation Plan

## Overview
Static, installable PWA for recipe browsing and hands-free cooking mode with parallel timers.
**No Firebase** — uses mock data (`parser/menemen.json`). **No parser agent** (Phase 4 deferred).
State management via **signals**. **TDD mandatory** — tests first, then implementation.
Each slice = separate commit with conventional message.

---

## Slice 0: Foundation & Tooling

### 0.1 Signals Library
**Commit:** `feat: add minimal signals implementation`

| File | Purpose |
|------|---------|
| `js/signals.js` | `signal(initial)`, `computed(fn)`, `effect(fn)`, `batch(fn)` — tiny reactive core |
| `test/signals.test.js` | Unit tests for signal behavior |

**Tests:**
- `signal` holds value, notifies subscribers on change
- `computed` derives lazily, caches until dependencies change
- `effect` runs immediately, re-runs on dependency change
- `batch` defers notifications until end of callback

---

### 0.2 Mock Recipe Service
**Commit:** `feat: add mock recipe data service`

| File | Purpose |
|------|---------|
| `js/data/recipes.js` | `getRecipes()` → `Promise<Recipe[]>`, `getRecipe(id)` → `Promise<Recipe>` — reads `parser/menemen.json` |
| `test/recipes.test.js` | Tests for data loading, shape validation |

**Tests:**
- `getRecipes` returns array with menemen recipe
- `getRecipe('menemen')` returns correct shape
- Missing ID throws/returns null

---

### 0.3 Recipe Type Definitions (JSDoc)
**Commit:** `docs: add JSDoc type definitions for Recipe schema`

| File | Purpose |
|------|---------|
| `js/types/recipe.js` | `@typedef` for Recipe, Ingredient, Step, Timer, Servings — matches `parser/schema.json` |

---

## Slice 1: Recipe Scaling Logic

### 1.1 Scaling Utilities
**Commit:** `feat: add recipe scaling utilities with tests`

| File | Purpose |
|------|---------|
| `js/utils/scaling.js` | `scaleAmount(amount, baseServings, targetServings)`, `formatAmount(amount, unit)`, `scaleIngredients(ingredients, base, target)` |
| `test/scaling.test.js` | Comprehensive unit tests |

**Tests:**
- `scaleAmount(200, 2, 4) === 400`
- `scaleAmount(1, 2, 3) === 1.5`
- `scaleAmount(0.5, 2, 1) === 0.25`
- `scaleIngredients` preserves `id`, `name`, `unit`, `notes`; scales `amount`
- `formatAmount` handles decimals: `1.5` → `"1.5"`, `1` → `"1"`, `0.25` → `"¼"` (optional)
- Spices (tsp/tbsp) scale same as others — no special casing in app

---

## Slice 2: Tag Filtering Logic

### 2.1 Tag Utilities
**Commit:** `feat: add tag extraction and filtering utilities with tests`

| File | Purpose |
|------|---------|
| `js/utils/tags.js` | `extractAllTags(recipes)`, `filterByTags(recipes, selectedTags)`, `filterByKeyword(recipes, query)` |
| `test/tags.test.js` | Unit tests |

**Tests:**
- `extractAllTags` returns unique sorted tags from all recipes
- `filterByTags([], [])` returns all recipes
- `filterByTags(recipes, ['vegetarian'])` returns only vegetarian recipes
- `filterByTags(recipes, ['breakfast', 'dinner'])` returns recipes matching ANY tag (OR logic)
- `filterByKeyword` matches title, ingredients, tags (case-insensitive)
- Combined: `filterByKeyword(filterByTags(recipes, tags), query)`

---

## Slice 3: Router & View Manager

### 3.1 Router
**Commit:** `feat: add hash-based router with view lifecycle`

| File | Purpose |
|------|---------|
| `js/router.js` | `router.start()`, `router.navigate(path)`, `router.on('route', cb)`, `router.currentRoute` (signal) |
| `test/router.test.js` | Tests |

**Routes:**
- `/` → Browse view
- `/recipe/:id` → Detail view
- `/cook/:id` → Cooking mode view

**Tests:**
- Navigation updates `currentRoute` signal
- Params extracted: `/recipe/menemen` → `{ id: 'menemen' }`
- Unknown route redirects to `/`
- Browser back/forward works

### 3.2 View Manager
**Commit:** `feat: add view manager for mounting/unmounting views`

| File | Purpose |
|------|---------|
| `js/views/view-manager.js` | `registerView(name, { render, destroy })`, `showView(name, params)` |
| `test/view-manager.test.js` | Tests |

**Tests:**
- `showView` calls `render(params)` and returns cleanup
- Switching views calls previous `destroy`
- Only one view mounted at a time

---

## Slice 4: Browse View

### 4.1 Browse View Component
**Commit:** `feat: implement browse view with recipe list, search, tag filters`

| File | Purpose |
|------|---------|
| `js/views/browse.js` | `render(params)` — fetches recipes, renders grid, search input, tag chips |
| `js/components/recipe-card.js` | `renderRecipeCard(recipe)` — title, timing, tags |
| `test/browse.test.js` | Integration tests (jsdom) |

**Tests:**
- Renders recipe cards for all recipes
- Search input filters by keyword (debounced 150ms)
- Tag chips show all unique tags; click toggles selection
- Multiple selected tags = OR filter
- Empty state when no recipes match
- Clicking card navigates to `/recipe/:id`

---

## Slice 5: Detail View

### 5.1 Servings Stepper Component
**Commit:** `feat: add servings stepper component with tests`

| File | Purpose |
|------|---------|
| `js/components/servings-stepper.js` | `renderStepper(baseServings, onChange)` — `+`/`-` buttons, value display |
| `test/servings-stepper.test.js` | Tests |

**Tests:**
- Default value = `baseServings` (2)
- Min 1, max 20
- `onChange(newValue)` called on click
- Disables `-` at 1, `+` at 20
- Keyboard accessible (Enter/Space)

### 5.2 Detail View Component
**Commit:** `feat: implement detail view with scaled ingredients and steps`

| File | Purpose |
|------|---------|
| `js/views/detail.js` | `render(params)` — title, meta, servings stepper, ingredient list (scaled), step preview, tags, source link, "Start Cooking" button |
| `test/detail.test.js` | Tests |

**Tests:**
- Shows recipe title, timing, tags, source link
- Ingredient list shows scaled amounts based on stepper value
- Stepper updates ingredient amounts live (via signal)
- Steps show order, text, timer label if present, ingredient chips
- "Start Cooking" navigates to `/cook/:id`
- Back button returns to browse

---

## Slice 6: Cooking Mode — Core

### 6.1 Cooking Mode View
**Commit:** `feat: implement cooking mode view with snap-scroll step cards`

| File | Purpose |
|------|---------|
| `js/views/cooking.js` | `render(params)` — full-screen, sticky header, scroll-snap step list, fixed timer tray |
| `js/components/cooking-step.js` | `renderCookingStep(step, ingredients, { isActive, isDone, onToggleDone, onStartTimer })` |
| `test/cooking.test.js` | Tests |

**State (signals):**
- `doneSteps` — `Set<stepId>` persisted to `sessionStorage`
- `activeStepId` — updated via IntersectionObserver on scroll

**Tests:**
- Renders all steps as cards with snap-scroll
- Step shows number, text, relevant ingredient chips (from `ingredientRefs`)
- Mark-done checkbox toggles `doneSteps`; persists to `sessionStorage`
- Done steps visually dimmed (opacity 0.6, green border)
- Active step highlighted (green left border) via scroll detection
- Timer button shows if `step.timer` exists; disabled while timer running
- Exit button returns to detail view, clears `sessionStorage`

---

## Slice 7: Timers — Engine & Manager

### 7.1 Timer Class
**Commit:** `feat: add Timer class with tests`

| File | Purpose |
|------|---------|
| `js/timers/timer.js` | `new Timer({ id, label, durationSeconds, onTick, onComplete })` — `start()`, `pause()`, `resume()`, `cancel()`, `getRemaining()` |
| `test/timer.test.js` | Tests (use fake timers) |

**Tests:**
- `start()` begins countdown; `onTick(remaining)` called every second
- `pause()` stops tick; `resume()` continues from remaining
- `cancel()` stops and resets; `onComplete` not called
- `onComplete` called exactly once when reaches 0
- `getRemaining()` returns milliseconds left
- Multiple timers independent

### 7.2 Timer Manager
**Commit:** `feat: add TimerManager for concurrent timers with tests`

| File | Purpose |
|------|---------|
| `js/timers/manager.js` | `TimerManager` — `startTimer(config)`, `pauseTimer(id)`, `resumeTimer(id)`, `cancelTimer(id)`, `getTimer(id)`, `getAllTimers()` (signal) |
| `test/timer-manager.test.js` | Tests |

**Tests:**
- Multiple timers run concurrently
- `getAllTimers()` returns signal updating on tick
- Starting same timer twice returns existing (or throws)
- Completed timers stay in list with `done: true` until dismissed
- `dismissTimer(id)` removes from list

---

## Slice 8: Timer Tray & SW Integration

### 8.1 Timer Tray Component
**Commit:** `feat: add timer tray component`

| File | Purpose |
|------|---------|
| `js/components/timer-tray.js` | `renderTimerTray(timersSignal, { onDismiss, onPause, onResume })` — fixed bottom, shows all active timers |
| `test/timer-tray.test.js` | Tests |

**Tests:**
- Hidden when no active timers
- Shows each timer: label, MM:SS, pause/resume, dismiss
- Warning state (< 10s) → orange background
- Done state → green, pulsing
- Dismiss removes timer from manager

### 8.2 Service Worker Messaging
**Commit:** `feat: integrate service worker for background timer notifications`

| File | Purpose |
|------|---------|
| `js/timers/sw-messaging.js` | `scheduleNotification(timerId, label, delayMs)` → `navigator.serviceWorker.controller.postMessage({ type: 'SCHEDULE_TIMER', ... })` |
| `sw.js` | (extend existing) handle `SCHEDULE_TIMER`, show notification |
| `test/sw-messaging.test.js` | Tests (mock SW) |

**Tests:**
- `scheduleNotification` posts message to SW
- SW shows notification at correct time
- Notification click focuses app window
- Permission request flow on first timer start

---

## Slice 9: Polish & Error Handling

### 9.1 Empty & Error States
**Commit:** `feat: add empty and error states`

| File | Purpose |
|------|---------|
| `js/views/empty-states.js` | `renderEmptyState({ icon, title, text, action })`, `renderErrorState({ message, retry })` |
| `test/empty-states.test.js` | Tests |

**States:**
- Browse: no recipes, search no results
- Detail: recipe not found
- Cooking: no steps (should not happen)
- Network error (for future Firebase)

### 9.2 Offline Shell Verification
**Commit:** `chore: verify service worker caches all static assets`

- Run `npm test` → all pass
- Manual: `python3 -m http.server 8000`, load, go offline, refresh → app loads

---

## Slice 10: Test Suite & Lint

### 10.1 Test Coverage
**Commit:** `test: add integration tests for full flows`

| File | Purpose |
|------|---------|
| `test/integration.test.js` | Browse → Detail → Cooking → Timer flow |

### 10.2 Lint & CI
**Commit:** `chore: ensure lint and tests pass`

- `npm run lint` — zero warnings/errors
- `npm test` — all tests pass
- Add GitHub Actions workflow (optional)

---

## Commit Sequence Summary

| # | Commit Message | Slice |
|---|----------------|-------|
| 1 | `feat: add minimal signals implementation` | 0.1 |
| 2 | `feat: add mock recipe data service` | 0.2 |
| 3 | `docs: add JSDoc type definitions for Recipe schema` | 0.3 |
| 4 | `feat: add recipe scaling utilities with tests` | 1.1 |
| 5 | `feat: add tag extraction and filtering utilities with tests` | 2.1 |
| 6 | `feat: add hash-based router with view lifecycle` | 3.1 |
| 7 | `feat: add view manager for mounting/unmounting views` | 3.2 |
| 8 | `feat: implement browse view with recipe list, search, tag filters` | 4.1 |
| 9 | `feat: add servings stepper component with tests` | 5.1 |
| 10 | `feat: implement detail view with scaled ingredients and steps` | 5.2 |
| 11 | `feat: implement cooking mode view with snap-scroll step cards` | 6.1 |
| 12 | `feat: add Timer class with tests` | 7.1 |
| 13 | `feat: add TimerManager for concurrent timers with tests` | 7.2 |
| 14 | `feat: add timer tray component` | 8.1 |
| 15 | `feat: integrate service worker for background timer notifications` | 8.2 |
| 16 | `feat: add empty and error states` | 9.1 |
| 17 | `chore: verify service worker caches all static assets` | 9.2 |
| 18 | `test: add integration tests for full flows` | 10.1 |
| 19 | `chore: ensure lint and tests pass` | 10.2 |

---

## TDD Rules

1. **Write test first** — create `test/*.test.js` with failing assertions
2. **Run test** — confirm failure (`npm test`)
3. **Implement minimal code** — make test pass
4. **Refactor** — clean up, keep tests passing
5. **Commit** — with message above
6. **Repeat** — next slice

---

## File Structure (New)

```
js/
├── bootstrap.js              (update — wire router, views, state)
├── signals.js                (NEW)
├── router.js                 (NEW)
├── views/
│   ├── view-manager.js       (NEW)
│   ├── browse.js             (NEW)
│   ├── detail.js             (NEW)
│   └── cooking.js            (NEW)
├── components/
│   ├── recipe-card.js        (NEW)
│   ├── servings-stepper.js   (NEW)
│   ├── cooking-step.js       (NEW)
│   └── timer-tray.js         (NEW)
├── data/
│   └── recipes.js            (NEW — mock service)
├── utils/
│   ├── scaling.js            (NEW)
│   └── tags.js               (NEW)
├── timers/
│   ├── timer.js              (NEW)
│   ├── manager.js            (NEW)
│   └── sw-messaging.js       (NEW)
└── types/
    └── recipe.js             (NEW — JSDoc typedefs)

test/
├── signals.test.js           (NEW)
├── recipes.test.js           (NEW)
├── scaling.test.js           (NEW)
├── tags.test.js              (NEW)
├── router.test.js            (NEW)
├── view-manager.test.js      (NEW)
├── browse.test.js            (NEW)
├── servings-stepper.test.js  (NEW)
├── detail.test.js            (NEW)
├── cooking.test.js           (NEW)
├── timer.test.js             (NEW)
├── timer-manager.test.js     (NEW)
├── timer-tray.test.js        (NEW)
├── sw-messaging.test.js      (NEW)
├── empty-states.test.js      (NEW)
└── integration.test.js       (NEW)
```

---

## Out of Scope (v1)

- Firebase integration (mock only)
- Parser agent (Phase 4)
- Recipe images
- Shopping list
- Multi-recipe cooking
- Notes/ratings
- Multi-user