import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
  monthlyTotals, categoryBreakdown, upcomingPayments, recentTransactions,
  getDashboardData, type DashTx,
} from '@/lib/dashboard'
import { prisma } from '@/lib/prisma'
import { addDaysUTC } from '@/lib/recurrence'
import * as notifications from '@/lib/notifications'

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

  it('día 1 del mes a medianoche UTC cuenta en ese mes (convención UTC)', () => {
    const txns: DashTx[] = [
      { type: 'EXPENSE', amount: 10000, date: new Date('2026-07-01T00:00:00Z'), status: 'CLEARED' },
    ]
    expect(monthlyTotals(txns, 2026, 6).expense).toBe(10000)
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

describe.skipIf(!process.env.DATABASE_URL)('getDashboardData: comprometido no se limita a los 3 mostrados', () => {
  const email = `dashcap_${Date.now()}@growly.app`
  const now = new Date('2026-07-06T12:00:00Z')
  let userId = ''
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'DashCap', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    await prisma.transaction.createMany({
      data: [7, 8, 9, 10].map((day) => ({
        userId, accountId: a.id, type: 'EXPENSE' as const, amount: 10000,
        description: `p${day}`, date: new Date(`2026-07-${day < 10 ? '0' + day : day}`), status: 'PENDING' as const,
      })),
    })
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('suma los 4 pendientes en comprometido pero muestra solo 3', async () => {
    const d = await getDashboardData(userId, now)
    expect(d.comprometido).toBe(40000) // los 4 pendientes futuros
    expect(d.upcoming.length).toBe(3)  // display limitado a 3
    expect(d.disponible).toBe(-40000)  // total 0 − comprometido 40000
  })
})

describe.skipIf(!process.env.DATABASE_URL)('getDashboardData materializa recurrencias', () => {
  const email = `dashrec_${Date.now()}@growly.app`
  const now2 = new Date()
  let uid = ''
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'DashRec', email } })
    uid = u.id
    const a = await prisma.account.create({ data: { userId: uid, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    await prisma.recurringRule.create({
      data: {
        userId: uid, accountId: a.id, type: 'EXPENSE', amount: 3000, description: 'Gimnasio',
        frequency: 'MONTHLY', startDate: addDaysUTC(now2, 5),
      },
    })
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: uid } })
    await prisma.recurringRule.deleteMany({ where: { userId: uid } })
    await prisma.account.deleteMany({ where: { userId: uid } })
    await prisma.user.delete({ where: { id: uid } })
  })

  it('las ocurrencias generadas alimentan comprometido y próximos pagos', async () => {
    const d = await getDashboardData(uid, now2)
    // mensual desde now+5d dentro de 90 días → 3 ocurrencias de $30.00
    expect(d.comprometido).toBe(9000)
    expect(d.upcoming[0].description).toBe('Gimnasio')
    // los PENDING futuros materializados NO aparecen en "recientes" (este usuario no tiene movimientos reales)
    expect(d.recent.length).toBe(0)
  })
})

describe.skipIf(!process.env.DATABASE_URL)('getDashboardData · budget', () => {
  const email = `dashbud_${Date.now()}@growly.app`
  let uid = ''
  let accId = ''
  let catId = ''
  const now = new Date()

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'DashBud', email } })
    uid = u.id
    accId = (await prisma.account.create({ data: { userId: uid, name: 'C', type: 'CHECKING' } })).id
    catId = (await prisma.category.create({ data: { userId: uid, name: 'DashComida', kind: 'EXPENSE', colorHex: '#3B82F6' } })).id
  })
  afterAll(async () => {
    await prisma.budget.deleteMany({ where: { userId: uid } })
    await prisma.transaction.deleteMany({ where: { userId: uid } })
    await prisma.category.deleteMany({ where: { userId: uid } })
    await prisma.account.deleteMany({ where: { userId: uid } })
    await prisma.user.delete({ where: { id: uid } })
  })

  it('sin budgets devuelve budget: null', async () => {
    const d = await getDashboardData(uid, now)
    expect(d.budget).toBeNull()
  })

  it('con budget devuelve totales y top con nombre/color de la categoría', async () => {
    await prisma.budget.create({
      data: { userId: uid, categoryId: catId, year: now.getFullYear(), month: now.getMonth(), amount: 100_000 },
    })
    await prisma.transaction.create({
      data: {
        userId: uid, accountId: accId, categoryId: catId, type: 'EXPENSE',
        amount: 25_000, description: 'Súper', date: now, status: 'CLEARED',
      },
    })
    const d = await getDashboardData(uid, now)
    expect(d.budget).not.toBeNull()
    expect(d.budget!.totals).toMatchObject({ limit: 100_000, spent: 25_000, pct: 25 })
    expect(d.budget!.top[0]).toMatchObject({ name: 'DashComida', colorHex: '#3B82F6', pct: 25, over: false })
  })
})

describe.skipIf(!process.env.DATABASE_URL)('getDashboardData · goals', () => {
  const email = `dashgoal_${Date.now()}@growly.app`
  let uid = ''
  const now = new Date()

  beforeAll(async () => {
    uid = (await prisma.user.create({ data: { name: 'DashGoal', email } })).id
  })
  afterAll(async () => {
    await prisma.goalContribution.deleteMany({ where: { userId: uid } })
    await prisma.goal.deleteMany({ where: { userId: uid } })
    await prisma.user.delete({ where: { id: uid } })
  })

  it('sin metas devuelve goals: []', async () => {
    const d = await getDashboardData(uid, now)
    expect(d.goals).toEqual([])
  })

  it('con metas devuelve top 3 con pct', async () => {
    for (const [i, name] of ['A', 'B', 'C', 'D'].entries()) {
      const g = await prisma.goal.create({
        data: { userId: uid, name, targetAmount: 100_000, colorHex: '#10B981' },
      })
      if (i === 0) {
        await prisma.goalContribution.create({
          data: { goalId: g.id, userId: uid, amount: 48_000, date: now },
        })
      }
    }
    const d = await getDashboardData(uid, now)
    expect(d.goals).toHaveLength(3)
    expect(d.goals[0]).toMatchObject({ name: 'A', pct: 48, barPct: 48 })
  })
})

describe.skipIf(!process.env.DATABASE_URL)('getDashboardData · cashflow y deltas', () => {
  const email = `dashflow_${Date.now()}@growly.app`
  let uid = ''
  const now = new Date()

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'DashFlow', email } })
    uid = u.id
    const a = await prisma.account.create({ data: { userId: uid, name: 'C', type: 'CHECKING' } })
    await prisma.transaction.create({
      data: {
        userId: uid, accountId: a.id, type: 'INCOME', amount: 100_000,
        description: 'Nómina', date: now, status: 'CLEARED',
      },
    })
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: uid } })
    await prisma.account.deleteMany({ where: { userId: uid } })
    await prisma.user.delete({ where: { id: uid } })
  })

  it('devuelve la serie de 6 meses y deltas', async () => {
    const d = await getDashboardData(uid, now)
    expect(d.cashflow).toHaveLength(6)
    const cur = d.cashflow[5]
    expect([cur.year, cur.month]).toEqual([now.getFullYear(), now.getMonth()])
    expect(cur.income).toBe(100_000)
    // mes anterior sin datos → deltas null
    expect(d.deltas).toEqual({ incomePct: null, expensePct: null })
  })
})

describe.skipIf(!process.env.DATABASE_URL)('getDashboardData · alertas', () => {
  const email = `dashalert_${Date.now()}@growly.app`
  let uid = ''
  const now = new Date()
  const hoyUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

  beforeAll(async () => {
    uid = (await prisma.user.create({ data: { name: 'DashAlert', email } })).id
    const acc = await prisma.account.create({ data: { userId: uid, name: 'C', type: 'CHECKING' } })
    const cat = await prisma.category.create({ data: { userId: uid, name: 'DashAlertCat', kind: 'EXPENSE' } })
    await prisma.budget.create({
      data: { userId: uid, categoryId: cat.id, year: now.getFullYear(), month: now.getMonth(), amount: 100_000 },
    })
    await prisma.transaction.create({
      data: {
        userId: uid, accountId: acc.id, categoryId: cat.id, type: 'EXPENSE', amount: 86_000,
        description: 'Súper', date: hoyUTC, status: 'CLEARED',
      },
    })
  })
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: uid } })
    await prisma.transaction.deleteMany({ where: { userId: uid } })
    await prisma.budget.deleteMany({ where: { userId: uid } })
    await prisma.category.deleteMany({ where: { userId: uid } })
    await prisma.account.deleteMany({ where: { userId: uid } })
    await prisma.user.delete({ where: { id: uid } })
  })

  it('cargar el dashboard persiste la alerta del presupuesto sin duplicar', async () => {
    await getDashboardData(uid, now)
    await getDashboardData(uid, now)
    const notifs = await prisma.notification.findMany({ where: { userId: uid } })
    expect(notifs).toHaveLength(1)
    expect(notifs[0].type).toBe('BUDGET_WARN')
  })

  it('no tumba el dashboard si la persistencia de alertas falla (best-effort)', async () => {
    const spy = vi
      .spyOn(notifications, 'persistAlertCandidates')
      .mockRejectedValue(new Error('neon caído'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const d = await getDashboardData(uid, now)
      expect(spy).toHaveBeenCalled() // el trigger de alertas se intentó
      expect(d.monthly).toBeDefined() // pero el dashboard igual devolvió sus datos
    } finally {
      spy.mockRestore()
      errSpy.mockRestore()
    }
  })
})
