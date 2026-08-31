# Yes Chef — AGENTS Guide

## Commands

| Command | What it does |
|---|---|
| `npm test` | Run Vitest test suite (jsdom) |
| `npm run lint` | Run ESLint on `js/` and `test/` |
| `python3 -m http.server [8000]` | Serve the app locally (no build needed); required for CORS (Firestore) |

## Key conventions & quirks

- **No build step**: The app is plain HTML/JS. Run with a local server for CORS support.
- **ESLint**: `no-unused-vars` ignores args matching `_` prefix. `eqeqeq: 'smart'` allows `== null`. `no-console` allows `error` level logs only. `no-alert` and `no-eval` are errors.
- **Vitest**: Tests run in jsdom with `url: 'http://localhost:3000/'`. Setup file is `test/setup.js`.
- **Firestore sync**: Single-user app using Firebase Auth (anonymous or email/password). Collection keys are auto-generated.
- **PWA**: Service worker registered for offline shell caching and background timer notifications.
- **Serving scaling**: Default 2 servings, auto-scales all ingredient quantities for any target count.

## Testing quirks

- Tests use jsdom; browser globals (e.g. `localStorage`, `fetch`) are available.
- `test/setup.js` runs before each test suite.
- Test files cover: `storage`, `recipes`, `scaling`, `timers`, `pwa`.
- To run a single test: `npx vitest run --reporter=verbose test/<file>` (or just `npm test` for all).

## Directory ownership

- `js/` — all app source (bootstrap, state, event wiring, API helpers, rendering, storage, timers, PWA)
- `test/` — Vitest unit tests
- `css/` — base.css + views.css
- `index.html` — app shell and markup
- `firebase.js` — Firebase SDK initialization and config
- `manifest.json` — PWA manifest
- `sw.js` — Service worker
- `parser/` — Desktop parsing agent output (JSON recipes matching schema)

## Common gotchas

- ESLint `no-console` is `warn` only for `error`; other consoles will trigger warnings.
- `prefer-template` rule enforced — prefer template literals over string concat.
- `no-else-return` and `no-lonely-if` are enforced — avoid else-after-return and deeply nested ifs.
- Firestore rules: single-user access gated by Firebase Auth; recipes are read-only from app perspective.
- Service worker must be registered from HTTPS or localhost for PWA features.
- Timer notifications require `Notification.permission === 'granted'` and service worker scope.
- iOS PWA requires "Add to Home Screen" for background notifications (iOS 16.4+).