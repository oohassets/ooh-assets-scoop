# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SCOOP OOH Assets is a Progressive Web App (PWA) and Firebase-hosted dashboard for managing out-of-home (OOH) advertising assets and campaigns across Qatar. It handles campaign booking, digital/static asset inventory, rate cards, and AI-powered assistance for SCOOP Media and Communication.

- **Live app:** https://oohassets.github.io/ooh-assets-scoop/
- **Firebase project:** `scoopassets`
- **RTDB:** `https://scoopassets-default-rtdb.firebaseio.com/`

## Commands

There is no root `package.json`. All commands run from `functions/`:

```bash
cd functions && npm install        # Install dependencies (Node.js 24 required)
npm run serve                      # Start Firebase emulator (functions only)
npm run shell                      # Interactive functions shell
npm run deploy                     # Deploy functions to Firebase
npm run logs                       # Stream function logs
firebase deploy --only hosting     # Deploy frontend (no build step — deployed as-is)
firebase deploy                    # Deploy everything
```

There is no build step, test runner, or linter configured. The frontend is vanilla HTML/CSS/JS deployed directly.

## Architecture

### Frontend (Vanilla ES Modules, No Framework)

The app uses client-side routing with dynamic module imports — there is no bundler. All JS is ES2015+ modules loaded natively by the browser.

**Boot sequence:**
1. `index.html` initializes Firebase Auth and registers the service worker
2. `assets/js/app.js` runs auth guard, then calls `router.loadFromURL()`
3. `router.js` maps `?page=` / `?map=` URL params to view modules and HTML templates
4. `switchView()` injects the page HTML into `#app-content`, injects a `<link>` for the page CSS, and dynamically `import()`s the view module, calling its `init(userName)` export

**View module contract** — every file in `assets/js/views/` must export:
```javascript
export async function init(userName) { /* setup, fetch data, render */ }
export function cleanup() { /* remove listeners, teardown */ }
```
`router.js` calls `cleanup()` on the outgoing view before loading the next one.

**Map mode** is an alternative to page mode: `setMap(key)` hides `#app-content`, shows the `#mapFrame` iframe, and updates the info card with asset rates. Navigating to any page restores content and hides the map.

### Key modules

| File | Responsibility |
|------|---------------|
| `assets/js/app.js` | Auth guard, bootstrap, global state (`window.__currentUser`) |
| `assets/js/router.js` | URL ↔ view mapping, `switchView()`, `setMap()`, `loadFromURL()` |
| `assets/js/utils.js` | `loadPage()` (HTML + CSS injection), `setURL()`, iframe helpers |
| `assets/js/asset-rates.js` | Rate card data (pricing, dimensions) for all ~40 asset locations |
| `assets/js/maps.js` | Google Maps embed URLs keyed by asset location |
| `assets/js/views/dashboard.js` | Live campaigns, stats charts, activity log (Firebase RTDB) |
| `assets/js/views/bookings.js` | Booking CRUD, date filters, status management |
| `assets/js/theme.js` | Dark/light toggle, `localStorage` persistence, broadcasts to iframes |
| `assets/js/notifications.js` | Firebase Cloud Messaging, push notification subscriptions |
| `firebase/firebase.js` | Firebase SDK initialization (imported by app.js and functions) |

### Backend (Firebase Cloud Functions — `functions/index.js`)

Three exported functions, all in `functions/index.js`:

- **`scoopAI`** — HTTP POST proxy to Anthropic Claude API (`claude-sonnet-4-6`). Accepts `{ system, messages }`, returns `{ content: [{ text }] }`. Requires `ANTHROPIC_API_KEY` secret. CORS-restricted to `oohassets.github.io` and localhost.
- **`chatbaseToken`** — HTTP POST that generates a signed JWT for Chatbase widget authentication. Requires `CHATBOT_IDENTITY_SECRET` secret.
- **`chatbaseDataSync`** — Scheduled function (every 6 hours, Qatar time) that reads campaign/circuit data from RTDB and pushes it to the Chatbase API for chatbot knowledge sync.

### Data (Firebase Realtime Database)

- Campaign bookings live under keys like `Campaigns_Booking`, `Campaign_Logs`
- Asset location keys follow the pattern `d_<location>` (digital) and `s_<location>` (static)
- Date fields are stored as `"MM/DD/YYYY"` strings (e.g. `"3/15/2025"`)
- Campaign status values: `"Live"`, `"BO Signed"`, `"Pending"`, `"Completed"`, `"Cancelled"`

### Styling

- `assets/css/theme.css` — design tokens (CSS custom properties), animations, resets — modify this for global visual changes
- `assets/css/layout.css` — main grid, dock, sidebar
- Page-specific CSS files (e.g. `dashboard.css`, `bookings.css`) are injected dynamically by the router alongside their view module
- CSS class names are kebab-case; element IDs are descriptive English (`mapFrame`, `app-content`, `campaignTableBody`)

### Deployment & CI/CD

- **Frontend:** `firebase deploy --only hosting` — deploys everything in the repo root except `functions/`, `firebase.json`, and dotfiles
- **Functions:** GitHub Actions (`.github/workflows/deploy-functions.yml`) auto-deploys on push to `main` when files under `functions/` change. Requires `FIREBASE_SERVICE_ACCOUNT` GitHub secret.
- **Service worker** (`service-worker.js`) is versioned (currently `v117.60`). Bump the cache name version string when making significant frontend changes that need to invalidate cached assets.

## Asset Location Naming Conventions

Digital locations are prefixed `d_`; static locations are prefixed `s_`. Key location keys used throughout `maps.js`, `asset-rates.js`, and RTDB:
- Digital: `underpass`, `mupi-c1`, `mupi-c2`, `gewan`, `udctower`, `monoprix`, `qqscreen`
- Static (light poles/MUPIs): `lightpoles-me`, `lightpoles-mb`, `lightpoles-mc`, `lightpoles-pa`, `mupi-pa`
