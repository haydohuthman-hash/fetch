/**
 * Demo battle state for development. Creates a realistic battle
 * so the UI renders meaningful content before backend is wired.
 */

import type { Battle, BattleActivityItem } from './types'

export function createDemoBattle(): Battle {
  const now = Date.now()
  return {
    id: 'demo_battle_001',
    mode: 'mixed',
    status: 'live',
    sellerA: {
      id: 'seller_a_demo',
      side: 'a',
      displayName: '@CoastlineCo',
      avatar: '🏄',
      rating: 4.8,
      featuredProduct: {
        id: 'prod_a_1',
        title: 'Walnut Desk Setup',
        imageUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=400&q=80',
        priceCents: 32000,
        saleMode: 'fixed',
        saleCount: 3,
      },
    },
    sellerB: {
      id: 'seller_b_demo',
      side: 'b',
      displayName: '@ArbourHomes',
      avatar: '🪴',
      rating: 4.9,
      featuredProduct: {
        id: 'prod_b_1',
        title: 'Oak Sideboard',
        imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&q=80',
        priceCents: 42000,
        saleMode: 'auction',
        bidCount: 7,
      },
    },
    scores: { a: 340, b: 285 },
    durationMs: 5 * 60 * 1000,
    startedAt: now - 2 * 60 * 1000,
    endsAt: now + 3 * 60 * 1000,
    result: null,
    viewerCount: 142,
    createdAt: now - 5 * 60 * 1000,
  }
}

export function createDemoActivity(): BattleActivityItem[] {
  const now = Date.now()
  return [
    { kind: 'boost', id: 'a1', viewerName: 'Sam', side: 'a', tier: 2, points: 30, ts: now - 3000 },
    { kind: 'sale', id: 'a2', viewerName: 'Mia', side: 'a', productTitle: 'Walnut Desk', ts: now - 8000 },
    { kind: 'bid', id: 'a3', viewerName: 'Jess', side: 'b', amountAud: 140, ts: now - 12000 },
    { kind: 'comment', id: 'a4', viewerName: 'Luca', text: 'This is fire 🔥', ts: now - 18000 },
    { kind: 'boost', id: 'a5', viewerName: 'Amy', side: 'b', tier: 1, points: 5, ts: now - 25000 },
    { kind: 'follow', id: 'a6', viewerName: 'Kai', sellerName: '@CoastlineCo', side: 'a', ts: now - 30000 },
    { kind: 'joined', id: 'a7', viewerName: 'Zara', ts: now - 45000 },
    { kind: 'sale', id: 'a8', viewerName: 'Tom', side: 'b', productTitle: 'Oak Sideboard', ts: now - 50000 },
    { kind: 'boost', id: 'a9', viewerName: 'Nia', side: 'a', tier: 3, points: 150, ts: now - 55000 },
    { kind: 'comment', id: 'a10', viewerName: 'Rex', text: 'Go CoastlineCo!', ts: now - 60000 },
  ]
}
