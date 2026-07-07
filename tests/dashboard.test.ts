import { describe, it, expect } from 'vitest'
import {
  monthlyTotals, categoryBreakdown, upcomingPayments, recentTransactions,
  type DashTx,
} from '@/lib/dashboard'

const cats = [
  { id: 'c1', name: 'Comida', colorHex: '#3B82F6' },
  { id: 'c2', name: 'Vivienda', colorHex: '#10B981' },
]

describe('monthlyTotals', () => {
  it('suma ingresos/gastos CLEARED del mes y calcula ahorro/tasa', () => {
    const txns: DashTx[] = [
      { type: 'INCOME', amount: 300000, date: new Date('2026-07-04'), status: 'CLEARED' },
      { type: 'EXPENSE', amount: 90000, date: new Date('2026-07-05'), status: 'CLEARED' },
      { type: 'EXPENSE', amount: 50000, date: new Date('2026-07-20'), status: 'PENDING' }, // ignorado
      { type: 'INCOME', amount: 100000, date: new Date('2026-06-30'), status: 'CLEARED' }, // otro mes
    ]
    expect(monthlyTotals(txns, 2026, 6)).toEqual({
      income: 300000, expense: 90000, savings: 210000, savingsRate: 70,
    })
  })
})

describe('categoryBreakdown', () => {
  it('agrupa gastos del mes por categoría, orden desc', () => {
    const txns: DashTx[] = [
      { type: 'EXPENSE', amount: 90000, date: new Date('2026-07-05'), categoryId: 'c1', status: 'CLEARED' },
      { type: 'EXPENSE', amount: 160000, date: new Date('2026-07-06'), categoryId: 'c2', status: 'CLEARED' },
      { type: 'EXPENSE', amount: 5000, date: new Date('2026-07-07'), categoryId: null, status: 'CLEARED' },
    ]
    const b = categoryBreakdown(txns, cats, 2026, 6)
    expect(b.map((x) => [x.name, x.total])).toEqual([
      ['Vivienda', 160000], ['Comida', 90000], ['Otros', 5000],
    ])
  })
})

describe('upcomingPayments / recentTransactions', () => {
  const now = new Date('2026-07-06T12:00:00Z')
  const txns = [
    { id: 'a', date: new Date('2026-07-10'), status: 'PENDING' as const },
    { id: 'b', date: new Date('2026-07-08'), status: 'PENDING' as const },
    { id: 'c', date: new Date('2026-07-01'), status: 'CLEARED' as const },
    { id: 'd', date: new Date('2026-07-05'), status: 'PENDING' as const }, // pasado → no upcoming
  ]
  it('upcoming: PENDING futuros, orden asc', () => {
    expect(upcomingPayments(txns, now).map((t) => t.id)).toEqual(['b', 'a'])
  })
  it('recent: orden desc por fecha', () => {
    expect(recentTransactions(txns, 2).map((t) => t.id)).toEqual(['a', 'b'])
  })
})
