import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  monthlyTotals, categoryBreakdown, upcomingPayments, recentTransactions,
  getDashboardData, type DashTx,
} from '@/lib/dashboard'
import { prisma } from '@/lib/prisma'

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

describe.skipIf(!process.env.DATABASE_URL)('getDashboardData', () => {
  const email = `dash_${Date.now()}@growly.app`
  const now = new Date('2026-07-06T12:00:00Z')
  let userId = ''
  let accountId = ''
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Dash', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 1000000 } })
    accountId = a.id
    await prisma.transaction.createMany({
      data: [
        { userId, accountId, type: 'INCOME', amount: 300000, description: 'Nómina', date: new Date('2026-07-04'), status: 'CLEARED' },
        { userId, accountId, type: 'EXPENSE', amount: 90000, description: 'Súper', date: new Date('2026-07-05'), status: 'CLEARED' },
        { userId, accountId, type: 'EXPENSE', amount: 50000, description: 'Alquiler', date: new Date('2026-07-20'), status: 'PENDING' },
      ],
    })
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('reúne totales, disponible/comprometido y KPIs del mes', async () => {
    const d = await getDashboardData(userId, now)
    // saldo cleared = 1,000,000 + 300,000 - 90,000 = 1,210,000
    expect(d.total).toBe(1210000)
    expect(d.comprometido).toBe(50000) // pago pendiente futuro
    expect(d.disponible).toBe(1210000 - 50000)
    expect(d.monthly).toEqual({ income: 300000, expense: 90000, savings: 210000, savingsRate: 70 })
    expect(d.upcoming.length).toBe(1)
    expect(d.recent.length).toBeGreaterThan(0)
  })
})
