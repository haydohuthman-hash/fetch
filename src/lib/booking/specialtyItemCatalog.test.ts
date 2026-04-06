import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeSpecialtyItemSlugs } from '../fetchAiBookingPatch'
import {
  computeSpecialtySurcharge,
  countSpecialtySlugs,
  normalizeSpecialtySlug,
} from './specialtyItemCatalog'

describe('specialtyItemCatalog', () => {
  it('normalizes slug casing and hyphens', () => {
    assert.equal(normalizeSpecialtySlug('Pool-Table'), 'pool_table')
    assert.equal(normalizeSpecialtySlug('  SPA  '), 'spa')
    assert.equal(normalizeSpecialtySlug('not-a-catalog-slug'), null)
  })

  it('applies surcharges for routed service types', () => {
    const r = computeSpecialtySurcharge('remove', ['piano'])
    assert.equal(r.aud, 95)
    assert.ok(r.lines.some((l) => l.label.includes('Piano')))
  })

  it('does not apply surcharges for hourly helper/cleaning by default', () => {
    assert.equal(computeSpecialtySurcharge('helpers', ['piano', 'spa']).aud, 0)
    assert.equal(computeSpecialtySurcharge('cleaning', ['pool_table']).aud, 0)
  })

  it('multiplies by quantity from repeated slugs (capped per slug)', () => {
    const r = computeSpecialtySurcharge('move', ['sofa', 'sofa'])
    assert.equal(r.aud, 56)
  })

  it('caps at five units per slug', () => {
    const many = Array.from({ length: 10 }, () => 'mattress')
    const r = computeSpecialtySurcharge('pickup', many)
    assert.equal(r.aud, 22 * 5)
    assert.equal(countSpecialtySlugs(many).get('mattress'), 5)
  })

  it('mergeSpecialtyItemSlugs adds patch quantities to existing', () => {
    const merged = mergeSpecialtyItemSlugs(['piano'], [{ slug: 'piano', quantity: 2 }])
    assert.equal(merged.filter((s) => s === 'piano').length, 3)
  })
})
