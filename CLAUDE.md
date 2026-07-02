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
4. `switchView()` calls `utils.js`'s `loadPage()`, which fetches the page HTML, injects any `<style>` blocks found in its `<head>`, and swaps `#app-content`'s innerHTML to the page's `<body>` contents (non-module `<script>`s are re-executed). `switchView()` separately loads the page's CSS file via a `<link>` (if a `cssPath` was passed) and dynamically `import()`s the view module, calling its `init(userName)` export.

**View module contract** — every file in `assets/js/views/` must export:
```javascript
export async function init(userName) { /* setup, fetch data, render */ }
export function cleanup() { /* remove listeners, teardown */ }
```
`router.js` calls `cleanup()` on the outgoing view before loading the next one.

**Map mode** is an alternative to page mode: `setMap(key)` hides `#app-content`, shows the `#mapFrame` iframe, and updates the info card with asset rates. Navigating to any page restores content and hides the map.

**Splash is the default landing page** — `loadFromURL()` falls back to `openSplash()` (not `openHome()`) when there's no `?page=`/`?map=` param, i.e. right after login. `pages/splash.html` is the marketing hero (Pearl Island photo background, brand-tinted glass panel, "Get Started Booking" / "View Media Contents" CTAs) that used to live at the top of `dashboard.html`; `dashboard.html` now starts directly at the stats grid. `openHome()` still means "go to the Dashboard" (nav-center's "Dashboard" link, dock's home icon) — it does not mean splash.

**Nav right-side swap** — `navigation.js`'s `setNavPageTitle(title, sub)` toggles what's shown on the right side of the top nav: on Dashboard/Splash it's the chatbot/notification/avatar icon cluster (`.nav-actions`); on every other page (Bookings, Content Inventory, Vehicle Traffic, map views, etc.) it's replaced by that page's title + subtitle (`#navPageTitle`, absolutely positioned over the same spot). Every `open*()`/`setMap()` function in `router.js` calls this — call it with `(null)` for icon mode, or `(title, sub)` for title mode when adding a new page.

**Gotchas when adding/editing a page loaded via the router:**
- A page's own `<link rel="stylesheet">` tags are **ignored** in SPA mode — `loadPage()` only auto-injects `<style>` blocks. Any external page CSS file must be registered as the `cssPath` argument to `switchView()` in `router.js` (see `openContentInventory()`).
- CSS rules on `body` don't apply in SPA mode — only the page's `<body>` *children* get injected into `#app-content`, not a literal `<body>` element. Page-level padding/centering/background must be scoped to a wrapper div instead (see `.vr-page` in `vehicle-report.css`).
- Pages meant to also work opened standalone (outside the SPA — e.g. `pages/asset-dimension-checker.html`, `pages/image-compressor.html`) need to keep their own `<link>`/theme-sync `<script>` for that context *in addition to* being registered with the router for SPA mode.
- New pages need a `setNavPageTitle(...)` call in their `router.js` `open*()` function (see above), or the nav will keep showing whatever the previous page set.

### Key modules

| File | Responsibility |
|------|---------------|
| `assets/js/app.js` | Auth guard, bootstrap, global state (`window.__currentUser`) |
| `assets/js/router.js` | URL ↔ view mapping, `switchView()`, `setMap()`, `loadFromURL()` |
| `assets/js/utils.js` | `loadPage()` (HTML + CSS injection), `setURL()`, iframe helpers |
| `assets/js/asset-rates.js` | Fetches the `assetrate` RTDB table (cached, re-keyed by each record's own `id`), renders the map info-card |
| `assets/js/maps.js` | Google Maps embed URLs keyed by asset location |
| `assets/js/navigation.js` | Nav bar transparent-at-top + hide-on-scroll (`updateNavAtTop()`, `updateScrollDirection()`), icon/title swap (`setNavPageTitle()`), mobile dock, dropdown panels |
| `assets/js/views/splash.js` | Landing page — wires the two hero CTA buttons to Bookings / Content Inventory |
| `assets/js/views/dashboard.js` | Live campaigns, stats charts, activity log (Firebase RTDB) |
| `assets/js/views/bookings.js` | Booking CRUD, date filters, status management |
| `assets/js/views/vehicle-report.js` | Vehicle traffic dashboard — month/date-range picker, circuit slicer sourced from `assetrate`, Chart.js bar/doughnut/horizontal-bar charts |
| `assets/js/theme.js` | Dark/light toggle, `localStorage` persistence, broadcasts to iframes |
| `assets/js/notifications.js` | Firebase Cloud Messaging, push notification subscriptions |
| `firebase/firebase.js` | Firebase SDK initialization (imported by app.js and functions) |

### Backend (Firebase Cloud Functions — `functions/index.js`)

Four exported functions, all in `functions/index.js`. `scoopAI` and `chatbaseToken` require a Firebase ID token (`Authorization: Bearer <idToken>`, verified server-side via the shared `verifyAuth()` helper using `admin.auth().verifyIdToken()`) in addition to CORS — CORS only blocks browser cross-origin calls, not direct/server-side requests, so it is not a substitute for auth on its own.

- **`scoopAI`** — HTTP POST proxy to Anthropic Claude API (`claude-sonnet-4-6`). Accepts `{ system, messages }`, returns `{ content: [{ text }] }`. Requires a valid ID token and the `ANTHROPIC_API_KEY` secret. CORS-restricted to `oohassets.github.io` and localhost.
- **`chatbaseToken`** — HTTP POST that generates a signed JWT for Chatbase widget authentication. `user_id`/`email` are taken from the verified ID token, never trusted from the request body. Requires `CHATBOT_IDENTITY_SECRET` secret.
- **`syncChatbaseData`** — Scheduled function (every 6 hours, Qatar time) that reads campaign/circuit data from RTDB and pushes it to the Chatbase API for chatbot knowledge sync. Requires `CHATBASE_API_KEY` secret.
- **`checkEndingCampaigns`** — Scheduled function (daily 8 AM Qatar time) that scans RTDB for campaigns ending today/tomorrow and sends FCM push notifications to tokens under `fcmTokens`.

### Data (Firebase Realtime Database)

- Campaign bookings live under keys like `Campaigns_Booking`, `Campaign_Logs`
- Asset location keys follow the pattern `d_<location>` (digital) and `s_<location>` (static)
- `assetrate` — rate card table. Rows are keyed by a plain sequential index (`1`, `2`, …), **not** by a slug — each record carries its own `id` field (e.g. `"underpass-entrance"`), plus `category` (`"digital"`/`"static"`), `name`, `faces` (numeric), `faces_screen` (formatted display string), `Rate`, `"Service Fee"`, `Duration`, `Dimensions`. Look up a record by scanning for `row.id === key`, never `data[key]` directly.
- `vehiclecounts` — per-day vehicle counts per circuit. Each record has `ContentDate` (`"MM/DD/YYYY"`), `ContentTotal`, and `Name` (bucketed by island via substring match — contains `"TPI"` or `"GEWAN"`, not an exact field).
- Date fields are stored as `"MM/DD/YYYY"` strings (e.g. `"3/15/2025"`)
- Campaign status values: `"Live"`, `"BO Signed"`, `"Pending"`, `"Completed"`, `"Cancelled"`

### Styling

- `assets/css/theme.css` — design tokens (CSS custom properties), animations, resets — modify this for global visual changes. Brand color is the red scale `--brand-300` … `--brand-700` (+ `--brand-wash`, `--focus-ring`); backgrounds use `--bg-base/surface/elevated/overlay`; semantic status colors are `--success`/`--warning`/`--error`/`--info`. Older token names (`--accent-indigo`, `--accent-cyan`, `--accent-violet`, `--accent-emerald`, `--accent-amber`, `--accent-rose`) still exist as aliases onto the brand/semantic tokens above (for page CSS that hasn't been migrated) — prefer the new names for new code.
- `assets/css/layout.css` — main grid, dock, sidebar
- Page-specific CSS files (e.g. `dashboard.css`, `bookings.css`, `vehicle-report.css`) are injected dynamically by the router alongside their view module — see the SPA gotchas above for what does/doesn't work in this mode
- `font-family: var(--font-body)` is the default everywhere; `var(--font-display)` is reserved for `.hero-headline` only
- CSS class names are kebab-case; element IDs are descriptive English (`mapFrame`, `app-content`, `campaignTableBody`)

### Deployment & CI/CD

- **Frontend:** `firebase deploy --only hosting` — deploys everything in the repo root except `functions/`, `firebase.json`, and dotfiles
- **Functions:** GitHub Actions (`.github/workflows/deploy-functions.yml`) auto-deploys on push to `main` when files under `functions/` change. Requires `FIREBASE_SERVICE_ACCOUNT` GitHub secret.
- **Service worker** (`service-worker.js`) is versioned (currently `v143`). Bump `CACHE_NAME` on every significant frontend change — the fetch handler is cache-first with no revalidation, so an unbumped change is silently invisible to any returning user until the version changes.

## Asset Location Naming Conventions

Digital locations are prefixed `d_`; static locations are prefixed `s_`. Key location keys used throughout `maps.js`, `asset-rates.js`, and RTDB:
- Digital: `underpass`, `mupi-c1`, `mupi-c2`, `gewan`, `udctower`, `monoprix`, `qqscreen`
- Static (light poles/MUPIs): `lightpoles-me`, `lightpoles-mb`, `lightpoles-mc`, `lightpoles-pa`, `mupi-pa`