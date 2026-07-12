import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getBudgetsForMonth, upsertBudgetForUser, deleteBudgetForUser } from '@/lib/budgets'

const email = `bud_${Date.now()}@growly.app`
let userId = ''
let otherId = ''
let catA = ''
let catB = ''

// "hoy" fijo: 15 jul 2026 → mes actual = {2026, 6}
const now = new Date(2026, 6, 15)
const Y = 2026
const MAY = 4, JUN = 5, JUL = 6, AGO = 7

describe.skipIf(!process.env.DATABASE_URL)('budgets DB', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Bud', email } })
    userId = u.id
    const o = await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })
    otherId = o.id
    const a = await prisma.category.create({ data: { userId, name: 'BudComida', kind: 'EXPENSE' } })
    const b = await prisma.category.create({ data: { userId, name: 'BudTransporte', kind: 'EXPENSE' } })
    catA = a.id
    catB = b.id
  })
  afterAll(async () => {
    await prisma.budget.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.category.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('upsert crea y luego actualiza sin duplicar', async () => {
    await upsertBudgetForUser(userId, { categoryId: catA, year: Y, month: JUN, amount: 40_000 })
    await upsertBudgetForUser(userId, { categoryId: catA, year: Y, month: JUN, amount: 50_000 })
    const rows = await prisma.budget.findMany({ where: { userId, year: Y, month: JUN } })
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(50_000)
    await upsertBudgetForUser(userId, { categoryId: catB, year: Y, month: JUN, amount: 20_000 })
  })

  it('mes pasado vacío NO copia', async () => {
    expect(await getBudgetsForMonth(userId, Y, MAY, now)).toEqual([])
  })

  it('mes futuro vacío NO copia', async () => {
    expect(await getBudgetsForMonth(userId, Y, AGO, now)).toEqual([])
  })

  it('auto-copia: mes actual vacío copia el mes anterior más reciente, idempotente', async () => {
    const first = await getBudgetsForMonth(userId, Y, JUL, now)
    expect(first).toHaveLength(2)
    expect(first.map((b) => b.amount).sort()).toEqual([20_000, 50_000])
    expect(first.every((b) => b.year === Y && b.month === JUL)).toBe(true)
    // segunda llamada: no duplica
    const second = await getBudgetsForMonth(userId, Y, JUL, now)
    expect(second).toHaveLength(2)
  })

  it('mes actual con filas NO re-copia', async () => {
    const jul = await prisma.budget.findFirst({ where: { userId, year: Y, month: JUL, categoryId: catA } })
    await upsertBudgetForUser(userId, { categoryId: catA, year: Y, month: JUL, amount: 77_000 })
    const rows = await getBudgetsForMonth(userId, Y, JUL, now)
    expect(rows.find((b) => b.id === jul!.id)!.amount).toBe(77_000)
    expect(rows).toHaveLength(2)
  })

  it('getBudgetsForMonth no devuelve budgets de otro usuario', async () => {
    expect(await getBudgetsForMonth(otherId, Y, JUN, now)).toEqual([])
  })

  it('deleteBudgetForUser respeta ownership', async () => {
    const row = await prisma.budget.findFirst({ where: { userId, year: Y, month: JUN, categoryId: catB } })
    expect(await deleteBudgetForUser(otherId, row!.id)).toEqual({ ok: false })
    expect(await deleteBudgetForUser(userId, row!.id)).toEqual({ ok: true })
    expect(await prisma.budget.count({ where: { id: row!.id } })).toBe(0)
  })
})
