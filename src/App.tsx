import { useEffect, useMemo, useReducer, useState, type CSSProperties, type ReactNode } from 'react'
import {
  baseUrl, getAlerts, getContractsPage, getFirstYear, getFuel, getMunicipalities, getNif, getWeather,
  getYearSummary, regionLabel, type Municipality,
} from './api'
import { dict, errorText, LangCtx, useT, type Lang } from './i18n'
import { stripNif } from './logic'
import { Bars, Skeleton, Sketch } from './sketch'

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const eur3 = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 3 })
const fmtEur = (n: number) => eur.format(n)
const fmtDate = (iso: string) => (iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-PT') : '—')

/** One colour family per card: ink = text/border (AA on fill), fill = paper tint, hl = highlighter. */
const THEMES = {
  header: { ink: '#2d2a26', fill: '#fff6cc', hl: '#ffd84d' },
  weather: { ink: '#1f5f99', fill: '#e6f1fb', hl: '#a9d1f5' },
  alerts: { ink: '#b8361c', fill: '#fdeae3', hl: '#f7b9a5' },
  fuel: { ink: '#8a5200', fill: '#fdf2dc', hl: '#f6cf80' },
  contracts: { ink: '#12756a', fill: '#e0f4f0', hl: '#9fdcd2' },
  year: { ink: '#6e3f96', fill: '#f1e7f9', hl: '#d2b6ea' },
}
type Theme = (typeof THEMES)[keyof typeof THEMES]
const themeVars = (t: Theme) => ({ '--accent': t.ink, '--hl': t.hl, '--tint': t.fill }) as CSSProperties

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

type Async<T> = { data?: T; error?: string; loading: boolean; retry: () => void }

/** Run an async fn when deps change; ignore stale results. */
function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const [attempt, retry] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    let live = true
    setState({ loading: true })
    fn().then(
      data => live && setState({ data, loading: false }),
      (e: unknown) => live && setState({ error: e instanceof Error ? e.message : String(e), loading: false }),
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])
  return { ...state, retry }
}

/** Renders loading / error / data for one async source, so one failing API never breaks the page. */
function Load<T>({ s, lines, children }: { s: Async<T>; lines?: number; children: (d: T) => ReactNode }) {
  const t = useT()
  if (s.loading) return <Skeleton lines={lines} label={t.loading} />
  if (s.error || s.data === undefined)
    return (
      <div className="oops" role="alert">
        <p>{t.oops} {s.error && errorText(t, s.error)}</p>
        <button onClick={s.retry}>{t.retry}</button>
      </div>
    )
  return <>{children(s.data)}</>
}

function Card({ title, seed, theme, children }: { title: string; seed: number; theme: Theme; children: ReactNode }) {
  return (
    <Sketch as="section" seed={seed} className="card" fill={theme.fill} stroke={theme.ink} style={themeVars(theme)}>
      <h2><span className="marker">{title}</span></h2>
      {children}
    </Sketch>
  )
}

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (read('mh:lang') === 'en' ? 'en' : 'pt'))
  const t = dict[lang]
  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-PT' : 'en'
    document.title = `${t.title} · ${t.tagline}`
  }, [lang, t])

  const munis = useAsync(getMunicipalities, [])
  const [slug, setSlug] = useState(() => read('mh:selected') ?? 'lisboa')
  const muni = munis.data?.find(m => m.slug === slug) ?? munis.data?.find(m => m.slug === 'lisboa')

  const choose = (m: Municipality) => { setSlug(m.slug); write('mh:selected', m.slug) }
  const switchLang = (l: Lang) => { setLang(l); write('mh:lang', l) }

  return (
    <LangCtx.Provider value={t}>
      <main>
        <Sketch as="header" seed={7} className="header" fill={THEMES.header.fill} style={themeVars(THEMES.header)}>
          <div className="brand">
            <h1><span className="marker">{t.title}</span></h1>
            <p className="tagline">{t.tagline}</p>
            {muni && <p className="where">📍 {muni.name} · {regionLabel(muni)}</p>}
          </div>
          <div className="controls">
            <div className="lang" role="group" aria-label="Idioma / Language">
              {(['pt', 'en'] as const).map(l => (
                <button key={l} aria-pressed={lang === l} onClick={() => switchLang(l)}>{l.toUpperCase()}</button>
              ))}
            </div>
            <Load s={munis} lines={1}>{list => <Picker list={list} current={muni} onChoose={choose} />}</Load>
          </div>
        </Sketch>

        {muni && <Dashboard key={muni.slug} m={muni} />}

        <footer>
          {t.data}: <a href="https://apiaberta.pt" target="_blank" rel="noreferrer">API Aberta</a> (IPMA, ANEPC, DGEG, BASE.gov.pt, geoapi.pt)
        </footer>
      </main>
    </LangCtx.Provider>
  )
}

/** Native <input list> gives a searchable dropdown for free. */
function Picker({ list, current, onChoose }: { list: Municipality[]; current?: Municipality; onChoose: (m: Municipality) => void }) {
  const t = useT()
  const label = (m: Municipality) => `${m.name} (${regionLabel(m)})`
  const byLabel = useMemo(() => new Map(list.map(m => [label(m), m])), [list])
  const [text, setText] = useState('')
  return (
    <label className="picker">
      <span>{t.concelho}</span>
      <input
        list="concelhos"
        value={text}
        placeholder={current ? label(current) : t.pickPlaceholder}
        onChange={e => {
          setText(e.target.value)
          const m = byLabel.get(e.target.value)
          if (m) { onChoose(m); setText('') }
        }}
        aria-label={t.pickAria}
      />
      <datalist id="concelhos">
        {list.map(m => <option key={m.slug} value={label(m)} />)}
      </datalist>
    </label>
  )
}

function Dashboard({ m }: { m: Municipality }) {
  const t = useT()
  const weather = useAsync(() => getWeather(m), [])
  const alerts = useAsync(() => getAlerts(m), [])
  const fuel = useAsync(() => getFuel(m), [])
  const nif = useAsync(() => getNif(m), [])

  return (
    <>
      <div className="row3">
        <Card title={t.weather} seed={11} theme={THEMES.weather}>
          <Load s={weather}>{w => (
            <>
              <p className="big">{w.tMin}° <span className="sep">/</span> {w.tMax}°</p>
              <p className="desc">{w.description}</p>
              <p>{t.rainWind(w.precipProb, w.windDir)}</p>
              <p className="note">{t.ipmaFor(w.place, w.km)}</p>
            </>
          )}</Load>
        </Card>

        <Card title={t.alerts} seed={12} theme={THEMES.alerts}>
          <Load s={alerts}>{a => a === null ? (
            <p className="note">{t.noCoverage}</p>
          ) : a.here.length === 0 ? (
            <>
              <p className="big ok">✓ {t.noAlerts}</p>
              <p className="note">{t.elsewhere(a.elsewhereInDistrict, m.district ?? '')}</p>
            </>
          ) : (
            <>
              <ul className="alerts">
                {a.here.slice(0, 4).map(i => (
                  <li key={i.id}>
                    <strong>{i.type}</strong> · {i.location.freguesia}
                    <br /><span className="note">{i.status} · {new Date(i.datetime).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })} · {t.resources(i.resources.ground, i.resources.aerial)}</span>
                  </li>
                ))}
              </ul>
              {a.here.length > 4 && <p className="note">{t.more(a.here.length - 4)}</p>}
            </>
          )}</Load>
        </Card>

        <Card title={t.fuel} seed={13} theme={THEMES.fuel}>
          <Load s={fuel}>{rows => (
            <>
              <dl className="fuel">
                {rows.map(r => (
                  <div key={r.slug}>
                    <dt>{t.fuels[r.slug]}</dt>
                    <dd>{r.avg === null ? '—' : `${eur3.format(r.avg)}/L`}</dd>
                  </div>
                ))}
              </dl>
              <p className="note">{t.fuelNote(rows[0].count, rows[0].scope, m.district, fmtDate(rows[0].date))}</p>
            </>
          )}</Load>
        </Card>
      </div>

      <div className="row2">
        <Card title={t.contracts} seed={21} theme={THEMES.contracts}>
          <Load s={nif} lines={6}>{n => <ContractsTable nif={n} />}</Load>
        </Card>
        <Card title={t.year} seed={22} theme={THEMES.year}>
          <Load s={nif} lines={6}>{n => <YearPanel nif={n} />}</Load>
        </Card>
      </div>
    </>
  )
}

function ContractsTable({ nif }: { nif: string }) {
  const t = useT()
  const [page, setPage] = useState(1)
  const s = useAsync(() => getContractsPage(nif, page), [nif, page])
  return (
    <Load s={s} lines={8}>{d => d.total === 0 ? <p>{t.noContracts}</p> : (
      <>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>{t.cols.map((c, i) => <th key={c} className={i === 3 ? 'num' : undefined}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {d.rows.map(c => (
                <tr key={c.id}>
                  <td className="nowrap">{fmtDate(c.date)}</td>
                  <td><a href={baseUrl(c.id)} target="_blank" rel="noreferrer" title={t.openBase}>{c.description}</a></td>
                  <td>{stripNif(c.awarded) || '—'}</td>
                  <td className="num nowrap amount">{c.value === null ? '—' : fmtEur(c.value)}</td>
                  <td><span className="chip">{c.type}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav className="pager" aria-label={t.pagesAria}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t.newer}</button>
          <span>{t.pageOf(page, d.pages.toLocaleString('pt-PT'))}</span>
          <button disabled={page >= d.pages} onClick={() => setPage(p => p + 1)}>{t.older}</button>
        </nav>
        <p className="note">{t.contractsNote}</p>
      </>
    )}</Load>
  )
}

function YearPanel({ nif }: { nif: string }) {
  const t = useT()
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const first = useAsync(() => getFirstYear(nif), [nif])
  const summary = useAsync(() => getYearSummary(nif, year), [nif, year])
  const years = Array.from({ length: thisYear - (first.data ?? thisYear) + 1 }, (_, i) => thisYear - i)

  return (
    <>
      <label className="year">
        <span>{t.yearLabel}</span>
        <select value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y}>{y}</option>)}
        </select>
      </label>
      <Load s={summary} lines={5}>{d => (
        <>
          <p className="big">{fmtEur(d.total)}</p>
          <p>{t.countIn(d.count.toLocaleString('pt-PT'), year)}</p>
          <Bars values={d.months} labels={t.months} format={fmtEur} color={THEMES.year.ink} title={t.monthly} />
          <p className="note vat"><strong>{t.vat}</strong> {t.vatNote}</p>
        </>
      )}</Load>
    </>
  )
}
