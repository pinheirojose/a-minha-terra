# A Minha Terra

**O que está a acontecer agora na minha terra.** A dashboard of what's happening right now in any Portuguese municipality (concelho), built on [API Aberta](https://apiaberta.pt).

Opens in Portuguese (pt-PT); there's a PT/EN switch in the header and the choice is remembered.
React + Vite + TypeScript, with [Rough.js](https://roughjs.com) for the hand-drawn look. No UI library.

## Setup

Requires Node 20+.

```bash
cp .env.example .env      # then paste your key into VITE_APIABERTA_KEY
npm install
npm run dev               # http://localhost:5173
```

`.env`:

```
VITE_APIABERTA_KEY=your-key-here
```

The key is optional. Without it API Aberta allows 30 requests/min per IP, and on 429 the app waits for the limit to reset and retries once. With a key the limit is 300/min. Get one free at <https://app.apiaberta.pt>.

**The key never reaches the browser.** The page calls `/api/...`. The Vite dev/preview proxy (`vite.config.ts`) forwards that to `https://api.apiaberta.pt` and adds the `X-API-Key` header on the server side. `envPrefix` is set so no `.env` value is bundled into client code.

## Deploy (Vercel)

Live at **https://a-minha-terra.vercel.app**. Every push to `main` redeploys.

In production, `api/proxy.ts` plays the part of the Vite proxy. `vercel.json` rewrites `/api/*` to it, and it forwards `GET /v1/...` to API Aberta with the `X-API-Key` header. Any other path gets a 404, so it can't be used as an open proxy. Responses are cached at Vercel's CDN for 60 s, so many visitors share requests instead of each using up the rate limit.

Set one environment variable in the Vercel project (mark it Sensitive): `APIABERTA_KEY` = your API Aberta key.

Other scripts: `npm run build` (type-check + build) and `npm test` (unit tests for the matching and aggregation logic, run with Node's built-in test runner).

## Which endpoints feed each widget

| Widget | Endpoint(s) | Notes |
|---|---|---|
| Municipality picker | `GET /v1/geo/municipalities?limit=400` | All 308 concelhos. Uses the native `<input list>` autocomplete. Last choice is saved in `localStorage`. |
| Weather | `GET /v1/ipma/locations` → `GET /v1/ipma/forecasts/:cityId` | IPMA forecasts exist for 35 locations, not every concelho. The app uses a same-name location if there is one, otherwise the nearest by coordinates, and says which. "Today" is IPMA's daily forecast (text, min/max, rain %, wind); API Aberta has no live observations. |
| Civil protection | `GET /v1/anpc/incidents?active=true&district=…` | Active ANEPC incidents in the district, narrowed to the concelho using the incident address ("District, Municipality, Parish"). ANEPC doesn't cover Azores/Madeira. |
| Fuel | `GET /v1/fuel/stations?fuel=diesel\|gasoline_95&district=…` (all pages), fallback `GET /v1/fuel/prices` | Average of the concelho's stations, otherwise the district, otherwise the national average. Only the most recent DGEG day is used (some stations keep stale prices). Scope and date are shown. |
| Contracts + spending per year | `GET /v1/base/contracts/search?q=Município de …` (once, to find the Câmara's NIF), then `GET /v1/base/contracts?nif=…&year=YYYY` (all pages); earliest year from the last page of `?nif=…` | One year selector drives both cards. The selected year's contracts are fetched once. The table pages through them (newest first, 10 per page, linked to base.gov.pt), and the side card shows the total, count and monthly bars from the same rows, so the numbers always match. |

**VAT:** amounts are BASE's *preço contratual*, which is **without VAT**. The UI says so next to the totals and the table.

## Quirks worth knowing

- `nif` on `/v1/base/contracts` matches the buyer **or** the supplier. The app keeps only contracts where the Câmara is the buyer (`contractingEntity`).
- `district` on `/fuel/stations` and `/anpc/incidents` is a case-insensitive substring match (`Braga` also matches `Bragança`), so the app re-checks the district name exactly.
- Azores/Madeira municipalities have `district: null` in the geo data. geoapi's centroid for Funchal is ~110 km off, which is why same-name IPMA locations take priority.

## Caching

Each widget's result is cached in `localStorage` (`mh:*` keys) with a TTL: alerts 5 min, weather 30 min, fuel and current-year contracts 1 h, past years 7 days, municipalities 7 days, NIF lookup 30 days. Clear site data to reset.

## Files

```
src/api.ts         API calls, cache, per-widget data shaping
src/logic.ts       pure helpers (name matching, nearest point, monthly totals) + logic.test.ts
src/sketch.tsx     Rough.js box, skeleton and bar chart
src/App.tsx        layout, widgets, per-card colour themes
src/i18n.ts        pt-PT / EN strings
src/styles.css     paper theme, Caveat / Patrick Hand fonts
vite.config.ts     /api proxy that adds the key
```
