import { createContext, useContext } from 'react'

export type Lang = 'pt' | 'en'
type Scope = 'concelho' | 'distrito' | 'nacional'

const pt = {
  title: 'A Minha Terra',
  tagline: 'O que está a acontecer agora na minha terra',
  concelho: 'Concelho',
  pickPlaceholder: 'Escreve o nome do concelho…',
  pickAria: 'Escolher concelho',
  loading: 'A carregar',
  oops: 'Ups, não foi possível carregar isto.',
  retry: 'Tentar outra vez',
  errors: {
    rateLimit: 'Demasiados pedidos à API Aberta. Tenta daqui a um minuto.',
    badKey: 'A API Aberta rejeitou a chave. Confirma VITE_APIABERTA_KEY no .env.',
    noForecast: 'O IPMA não tem previsão para este local neste momento.',
    nifNotFound: 'Não encontrei este município no portal BASE.',
    http: (s: string) => `A API Aberta respondeu ${s}.`,
  },
  weather: 'Tempo hoje',
  rainWind: (p: number, w: string) => `Chuva ${p}% · vento de ${w}`,
  ipmaFor: (place: string, km: number) => `Previsão IPMA para ${place}${km > 3 ? ` (a ${km} km)` : ''}`,
  alerts: 'Proteção Civil',
  noCoverage: 'A ANEPC não cobre as regiões autónomas; consulta o serviço regional de proteção civil.',
  noAlerts: 'Sem alertas ativos',
  elsewhere: (n: number, d: string) =>
    n ? `${n} ocorrência${n === 1 ? '' : 's'} noutros concelhos do distrito de ${d}.` : `Nada ativo no distrito de ${d}.`,
  more: (n: number) => `+${n} mais`,
  resources: (g: number, a: number) => `${g} meios terrestres, ${a} aéreos`,
  fuel: 'Combustíveis',
  fuels: { diesel: 'Gasóleo', gasoline_95: 'Gasolina 95' } as Record<string, string>,
  fuelNote: (n: number, scope: Scope, district: string | null, date: string) =>
    `Média de ${n} posto${n === 1 ? '' : 's'} ${{ concelho: 'no concelho', distrito: `no distrito de ${district}`, nacional: 'em todo o país' }[scope]} · dados DGEG de ${date}`,
  contracts: 'Contratos da Câmara',
  cols: ['Data', 'Objeto', 'Fornecedor', 'Valor', 'Procedimento'],
  openBase: 'Abrir no BASE.gov.pt',
  noContracts: 'Sem contratos no BASE.',
  newer: '← Mais recentes',
  older: 'Mais antigos →',
  pageOf: (p: number, n: string) => `Página ${p} de ${n}`,
  pagesAria: 'Páginas de contratos',
  contractsNote: 'Valores = preço contratual, sem IVA. O filtro por NIF também apanha contratos em que a Câmara é fornecedora; esses ficam de fora.',
  year: 'Gastos por ano',
  yearLabel: 'Ano',
  countIn: (n: string, y: number) => `${n} contrato${n === '1' ? '' : 's'} em ${y}`,
  vat: 'Sem IVA.',
  vatNote: 'Soma dos preços contratuais publicados no BASE.gov.pt, pela data do contrato.',
  monthly: 'Totais mensais',
  months: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  data: 'Dados',
}

const en: typeof pt = {
  title: 'A Minha Terra',
  tagline: "What's happening right now in my hometown",
  concelho: 'Municipality',
  pickPlaceholder: 'Type a municipality…',
  pickAria: 'Choose a municipality',
  loading: 'Loading',
  oops: "Hmm, couldn't load this.",
  retry: 'Try again',
  errors: {
    rateLimit: 'Too many requests to API Aberta. Try again in a minute.',
    badKey: 'API Aberta rejected the API key. Check VITE_APIABERTA_KEY in .env.',
    noForecast: 'IPMA has no forecast for this location right now.',
    nifNotFound: "Couldn't find this municipality on BASE.",
    http: (s: string) => `API Aberta answered ${s}.`,
  },
  weather: 'Weather today',
  rainWind: (p, w) => `Rain ${p}% · wind from ${w}`,
  ipmaFor: (place, km) => `IPMA forecast for ${place}${km > 3 ? ` (${km} km away)` : ''}`,
  alerts: 'Civil protection',
  noCoverage: "ANEPC doesn't cover the autonomous regions; check the regional civil protection service.",
  noAlerts: 'No active alerts',
  elsewhere: (n, d) => (n ? `${n} active elsewhere in ${d} district.` : `Nothing active in ${d} district either.`),
  more: n => `+${n} more`,
  resources: (g, a) => `${g} ground, ${a} air`,
  fuel: 'Fuel prices',
  fuels: { diesel: 'Diesel', gasoline_95: 'Petrol 95' },
  fuelNote: (n, scope, district, date) =>
    `Average of ${n} station${n === 1 ? '' : 's'} ${{ concelho: 'in the municipality', distrito: `in ${district} district`, nacional: 'in the whole country' }[scope]} · DGEG data of ${date}`,
  contracts: 'Contracts by the Câmara',
  cols: ['Date', 'Object', 'Supplier', 'Amount', 'Procedure'],
  openBase: 'Open on BASE.gov.pt',
  noContracts: 'No contracts found on BASE.',
  newer: '← Newer',
  older: 'Older →',
  pageOf: (p, n) => `Page ${p} of ${n}`,
  pagesAria: 'Contracts pages',
  contractsNote: 'Amounts are the contract price (preço contratual) without VAT. The NIF filter also matches contracts where the Câmara is the supplier; those are left out.',
  year: 'Spending per year',
  yearLabel: 'Year',
  countIn: (n, y) => `${n} contract${n === '1' ? '' : 's'} in ${y}`,
  vat: 'Without VAT.',
  vatNote: 'Sum of contract prices published on BASE.gov.pt, by contract date.',
  monthly: 'Monthly totals',
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  data: 'Data',
}

export const dict = { pt, en }
export type T = typeof pt
export const LangCtx = createContext<T>(pt)
export const useT = () => useContext(LangCtx)

/** api.ts throws short codes ("rateLimit", "http:503"); turn them into a sentence. */
export function errorText(t: T, msg: string) {
  if (msg.startsWith('http:')) return t.errors.http(msg.slice(5))
  return ((t.errors as Record<string, unknown>)[msg] as string | undefined) ?? msg
}
