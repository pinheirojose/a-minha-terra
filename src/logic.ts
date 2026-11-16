// Pure helpers (no I/O) — covered by logic.test.ts.

/** Lowercase, strip accents and extra spaces, for comparing place names across APIs. */
export const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

type Point = { lat: number; lng: number }

/** Closest point by equirectangular distance — plenty accurate at Portugal's scale. */
export function nearest<T extends Point>(points: T[], p: Point): T & { km: number } {
  const km = (q: Point) => {
    const x = (q.lng - p.lng) * Math.cos(((q.lat + p.lat) / 2) * (Math.PI / 180))
    return Math.hypot(x, q.lat - p.lat) * 111.32
  }
  const best = points.reduce((a, b) => (km(b) < km(a) ? b : a))
  return { ...best, km: km(best) }
}

/** Arithmetic mean, or null for an empty list. */
export const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Sum contract values per calendar month (index 0 = January). */
export function monthlyTotals(contracts: { date: string; value: number | null }[]) {
  const months = Array<number>(12).fill(0)
  for (const c of contracts) {
    const m = Number(c.date.slice(5, 7)) - 1
    if (m >= 0 && m < 12) months[m] += c.value ?? 0
  }
  return months
}

/** ANEPC addresses look like "District, Municipality, Parish". */
export const municipalityFromAddress = (address: string) => address.split(',')[1]?.trim() ?? ''

/** Keep only rows from the most recent day (DGEG keeps stale prices for closed stations). */
export function latestOnly<T extends { updated_at: string }>(rows: T[]) {
  const date = rows.reduce((d, r) => (r.updated_at > d ? r.updated_at : d), '').slice(0, 10)
  return { date, rows: rows.filter(r => r.updated_at.startsWith(date)) }
}

/**
 * BASE entities look like "506804240 - Município de Lagoa" / "Município do Corvo" /
 * "Município de Lagoa (Açores)". Returns the NIF whose name matches the geo municipality name.
 */
export function findNif(entities: string[], municipality: string): string | null {
  const want = norm(municipality)
  for (const e of entities) {
    const m = /^(\d{9}) - (.*)$/.exec(e)
    if (m && norm(m[2]).replace(/^municipio d[aoe]s? /, '') === want) return m[1]
  }
  return null
}

/** "516077872 - Aerizon, Lda" → "Aerizon, Lda"; private people come as "- - Name" (NIF hidden). */
export const stripNif = (s: string | null) => (s ?? '').replace(/^(?:\d{9}|-) - /, '')
