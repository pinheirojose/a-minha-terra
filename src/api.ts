import { average, findNif, latestOnly, monthlyTotals, municipalityFromAddress, nearest, norm } from './logic'

export type Municipality = { slug: string; name: string; district: string | null; coords: { lat: number; lng: number } }
export type Contract = {
  id: string
  description: string
  contractingEntity: string
  awarded: string | null
  value: number | null
  date: string
  type: string
}
type Page<T> = { total: number; page: number; pages: number; data: T[] }

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const enc = encodeURIComponent

/** All calls go through the Vite proxy (/api → api.apiaberta.pt), which adds the API key. */
async function api<T>(path: string, retried = false): Promise<T> {
  const r = await fetch('/api' + path)
  if (r.status === 429 && !retried) {
    // Keyless limit is 30 req/min: wait for the window to reset (max 30 s) and retry once.
    const wait = Math.min(Number(r.headers.get('x-ratelimit-reset')) || 10, 30)
    await new Promise(res => setTimeout(res, wait * 1000))
    return api<T>(path, true)
  }
  if (r.status === 429) throw new Error('rateLimit')
  if (r.status === 401) throw new Error('badKey')
  if (!r.ok) throw new Error(`http:${r.status}`)
  return r.json()
}

const memory = new Map<string, { t: number; p: Promise<unknown> }>()

/**
 * Cache a computed result with a TTL: in memory (also dedupes concurrent calls) and in
 * localStorage across reloads. Storage failures (quota, private mode) just mean less caching.
 */
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const mem = memory.get(key)
  if (mem && Date.now() - mem.t < ttlMs) return mem.p as Promise<T>
  const k = 'mh:' + key
  const p = (async () => {
    try {
      const hit = JSON.parse(localStorage.getItem(k) ?? 'null')
      if (hit && Date.now() - hit.t < ttlMs) return hit.v as T
    } catch { /* storage unavailable */ }
    const v = await fn()
    try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), v })) } catch { /* quota / private mode */ }
    return v
  })()
  memory.set(key, { t: Date.now(), p })
  p.catch(() => memory.delete(key)) // failed calls must be retryable
  return p
}

/** Fetch page 1, then all remaining pages in parallel. */
async function allPages<T>(path: string): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?'
  const first = await api<Page<T> & { meta?: { pages: number } }>(`${path}${sep}limit=100&page=1`)
  const pages = first.meta?.pages ?? first.pages
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
      api<Page<T>>(`${path}${sep}limit=100&page=${i + 2}`).then(p => p.data)),
  )
  return first.data.concat(...rest)
}

/** Azores/Madeira municipalities come with district: null. */
export const regionLabel = (m: Municipality) =>
  m.district ?? (m.coords.lng < -20 ? 'Açores' : 'Madeira')

// ---------- Municipalities ----------
export const getMunicipalities = () =>
  cached('municipalities', 7 * DAY, async () => {
    const r = await api<Page<Municipality>>('/v1/geo/municipalities?limit=400')
    return r.data
      .map(({ slug, name, district, coords }) => ({ slug, name, district, coords }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
  })

// ---------- Weather (IPMA) ----------
type IpmaLocation = { globalIdLocal: number; name: string; latitude: string; longitude: string }
type Forecast = { date: string; tMin: number; tMax: number; description: string; precipProb: number; windDir: string }

export const getWeather = (m: Municipality) =>
  cached('weather:' + m.slug, 30 * MIN, async () => {
    const locs = await cached('ipma-locations', 7 * DAY, () =>
      api<{ data: IpmaLocation[] }>('/v1/ipma/locations').then(r => r.data))
    const points = locs.map(l => ({ ...l, lat: +l.latitude, lng: +l.longitude }))
    // Same-name IPMA location wins (geoapi's centroid for Funchal is ~110 km off); else nearest.
    const same = points.find(l => norm(l.name) === norm(m.name))
    const loc = same ? { ...same, km: 0 } : nearest(points, m.coords)
    const f = await api<{ forecasts: Forecast[] }>(`/v1/ipma/forecasts/${loc.globalIdLocal}`)
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' }) // YYYY-MM-DD
    const day = f.forecasts.find(d => d.date === today) ?? f.forecasts[0]
    if (!day) throw new Error('noForecast')
    return { ...day, place: loc.name, km: Math.round(loc.km) }
  })

// ---------- Civil protection (ANEPC) ----------
export type Incident = {
  id: string
  datetime: string
  type: string
  status: string
  location: { district: string; address: string; freguesia: string }
  resources: { ground: number; aerial: number }
}

export const getAlerts = (m: Municipality) =>
  cached('alerts:' + m.slug, 5 * MIN, async () => {
    if (!m.district) return null // ANEPC doesn't cover the autonomous regions
    const r = await api<{ data: Incident[] }>(`/v1/anpc/incidents?active=true&limit=100&district=${enc(m.district)}`)
    // The API's district filter is a substring regex ("Braga" also matches "Bragança") — match exactly.
    const inDistrict = r.data.filter(i => norm(i.location.district) === norm(m.district))
    const here = inDistrict.filter(i => norm(municipalityFromAddress(i.location.address)) === norm(m.name))
    return { here, elsewhereInDistrict: inDistrict.length - here.length }
  })

// ---------- Fuel (DGEG) ----------
type Station = { price_eur: number; municipality: string; district: string; updated_at: string }
type FuelSummary = { fuel_slug: string; avg_price_eur: number; station_count: number; date: string }
export type FuelRow = { slug: string; avg: number | null; scope: 'concelho' | 'distrito' | 'nacional'; count: number; date: string }

const FUELS = ['diesel', 'gasoline_95'] as const

export const getFuel = (m: Municipality) =>
  cached('fuel:' + m.slug, HOUR, async () => {
    const national = await api<{ data: FuelSummary[] }>('/v1/fuel/prices')
    return Promise.all(FUELS.map(async (slug): Promise<FuelRow> => {
      const stations = m.district
        ? (await allPages<Station>(`/v1/fuel/stations?fuel=${slug}&district=${enc(m.district)}`))
            .filter(s => norm(s.district) === norm(m.district))
        : []
      const fresh = latestOnly(stations)
      const here = fresh.rows.filter(s => norm(s.municipality) === norm(m.name))
      const pick = here.length ? { scope: 'concelho' as const, rows: here } : fresh.rows.length ? { scope: 'distrito' as const, rows: fresh.rows } : null
      if (pick) return { slug, scope: pick.scope, avg: average(pick.rows.map(s => s.price_eur)), count: pick.rows.length, date: fresh.date }
      const nat = national.data.find(f => f.fuel_slug === slug)
      return { slug, scope: 'nacional', avg: nat?.avg_price_eur ?? null, count: nat?.station_count ?? 0, date: nat?.date ?? '' }
    }))
  })

// ---------- Public contracts (BASE) ----------
const baseName = (m: Municipality) => m.name.replace(/\s*\(.*\)$/, '') // "Lagoa (açores)" → "Lagoa"

/** BASE has no "contracting entity" filter, so find the Câmara's NIF via text search. */
export const getNif = (m: Municipality) =>
  cached('nif:' + m.slug, 30 * DAY, async () => {
    const q = enc('Município de ' + baseName(m))
    // Text search defaults to the last 365 days; widen the window if the council was quiet.
    for (const window of ['', '&from=2008-01-01']) {
      const r = await api<Page<Contract>>(`/v1/base/contracts/search?q=${q}&limit=100${window}`)
      const nif = findNif(r.data.map(c => c.contractingEntity), m.name)
      if (nif) return nif
    }
    throw new Error('nifNotFound')
  })

// `nif` matches buyer OR supplier; we only want contracts where the Câmara is the buyer.
const isBuyer = (nif: string) => (c: Contract) => c.contractingEntity.startsWith(nif)

/** Oldest contract year = the last item of the newest-first list. */
export const getFirstYear = (nif: string) =>
  cached('first-year:' + nif, 7 * DAY, async () => {
    const { total } = await api<Page<Contract>>(`/v1/base/contracts?nif=${nif}&limit=1`)
    if (!total) return new Date().getFullYear()
    const last = await api<Page<Contract>>(`/v1/base/contracts?nif=${nif}&limit=1&page=${total}`)
    return Number(last.data[0]?.date.slice(0, 4)) || new Date().getFullYear()
  })

export type ContractRow = Pick<Contract, 'id' | 'description' | 'awarded' | 'value' | 'date' | 'type'>

/** Every contract the Câmara signed in `year` (newest first) — feeds both the table and the chart. */
export const getYear = (nif: string, year: number) =>
  // "year2:" — v1 entries only held totals, not rows.
  cached(`year2:${nif}:${year}`, year === new Date().getFullYear() ? HOUR : 7 * DAY, async () => {
    const rows: ContractRow[] = (await allPages<Contract>(`/v1/base/contracts?nif=${nif}&year=${year}`))
      .filter(isBuyer(nif))
      .map(({ id, description, awarded, value, date, type }) => ({ id, description, awarded, value, date, type }))
      .sort((a, b) => b.date.localeCompare(a.date))
    const months = monthlyTotals(rows)
    return { rows, months, total: months.reduce((a, b) => a + b, 0) }
  })

export const baseUrl = (id: string) => `https://www.base.gov.pt/Base4/pt/detalhe/?type=contratos&id=${enc(id)}`
