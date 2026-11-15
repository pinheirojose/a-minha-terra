import { test } from 'node:test'
import assert from 'node:assert/strict'
import { average, findNif, latestOnly, monthlyTotals, municipalityFromAddress, nearest, norm, stripNif } from './logic.ts'

test('findNif handles de/do/da and island suffixes, and ignores look-alikes', () => {
  const ents = [
    '506624200 - Município de Miranda do Corvo',
    '512065837 - Município do Corvo',
    '506804240 - Município de Lagoa',
    '512074410 - Município de Lagoa (Açores)',
  ]
  assert.equal(findNif(ents, 'Corvo'), '512065837')
  assert.equal(findNif(ents, 'Lagoa'), '506804240')
  assert.equal(findNif(ents, 'Lagoa (açores)'), '512074410')
  assert.equal(findNif(['512044023 - Município da Praia da Vitória'], 'Praia da Vitória'), '512044023')
  assert.equal(findNif(ents, 'Braga'), null)
})

test('monthlyTotals sums by month and treats null values as 0', () => {
  const m = monthlyTotals([
    { date: '2025-01-10', value: 100 },
    { date: '2025-01-31', value: 50.5 },
    { date: '2025-12-01', value: null },
    { date: '2025-12-02', value: 7 },
  ])
  assert.equal(m[0], 150.5)
  assert.equal(m[11], 7)
  assert.equal(m.reduce((a, b) => a + b), 157.5)
})

test('latestOnly drops stale station prices', () => {
  const r = latestOnly([
    { updated_at: '2026-11-15T07:30:00Z' },
    { updated_at: '2026-03-09T07:30:00Z' },
    { updated_at: '2026-11-15T07:31:00Z' },
  ])
  assert.equal(r.date, '2026-11-15')
  assert.equal(r.rows.length, 2)
})

test('stripNif handles company NIFs and hidden private-person NIFs', () => {
  assert.equal(stripNif('516077872 - Aerizon, Lda'), 'Aerizon, Lda')
  assert.equal(stripNif('- - Sérgio Bastos'), 'Sérgio Bastos')
  assert.equal(stripNif('Sem NIF - Lda'), 'Sem NIF - Lda')
  assert.equal(stripNif(null), '')
})

test('misc helpers', () => {
  assert.equal(norm('  Évora  Castelo '), 'evora castelo')
  assert.equal(municipalityFromAddress('Leiria, Alcobaça, Alfeizerão'), 'Alcobaça')
  assert.equal(average([]), null)
  assert.equal(average([1, 2]), 1.5)
  const p = nearest([{ lat: 41.55, lng: -8.42, n: 'Braga' }, { lat: 38.77, lng: -9.13, n: 'Lisboa' }], { lat: 41.4, lng: -8.5 })
  assert.equal(p.n, 'Braga')
  assert.ok(p.km > 10 && p.km < 25)
})
