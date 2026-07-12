import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const email = `budact_${Date.now()}@growly.app`
let userId = ''
let otherId = ''
let catGasto = ''
let catIngreso = ''
let catAjena = ''

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { upsertBudget, deleteBudget } from '@/lib/budget-actions'

const Y = 2026
const JUL = 6

describe.skipIf(!process.env.DATABASE_URL)('budget actions', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'BudAct', email } })
    userId = u.id
    const o = await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })
    otherId = o.id
    catGasto = (await prisma.category.create({ data: { userId, name: 'ActComida', kind: 'EXPENSE' } })).id
    catIngreso = (await prisma.category.create({ data: { userId, name: 'ActSueldo', kind: 'INCOME' } })).id
    catAjena = (await prisma.category.create({ data: { userId: otherId, name: 'ActAjena', kind: 'EXPENSE' } })).id
  })
  afterAll(async () => {
    await prisma.budget.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.category.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('upsertBudget crea un presupuesto', async () => {
    const res = await upsertBudget({ categoryId: catGasto, year: Y, month: JUL, amount: 100_000 })
    expect(res.ok).toBe(true)
    expect(await prisma.budget.count({ where: { userId, year: Y, month: JUL } })).toBe(1)
  })

  it('rechaza categoría de ingreso', async () => {
    const res = await upsertBudget({ categoryId: catIngreso, year: Y, month: JUL, amount: 100_000 })
    expect(res).toEqual({ ok: false, error: 'Categoría no válida' })
  })

  it('rechaza categoría ajena', async () => {
    const res = await upsertBudget({ categoryId: catAjena, year: Y, month: JUL, amount: 100_000 })
    expect(res).toEqual({ ok: false, error: 'Categoría no válida' })
  })

  it('rechaza amount <= 0 y month fuera de rango', async () => {
    expect((await upsertBudget({ categoryId: catGasto, year: Y, month: JUL, amount: 0 })).ok).toBe(false)
    expect((await upsertBudget({ categoryId: catGasto, year: Y, month: 12, amount: 100 })).ok).toBe(false)
  })

  it('deleteBudget valida el id con zod', async () => {
    expect(await deleteBudget(123)).toEqual({ ok: false, error: 'Datos inválidos' })
  })

  it('deleteBudget: id de otro usuario → no encontrado; propio → borra', async () => {
    const row = await prisma.budget.findFirst({ where: { userId, year: Y, month: JUL } })
    const ajeno = await prisma.budget.create({
      data: { userId: otherId, categoryId: catAjena, year: Y, month: JUL, amount: 1_000 },
    })
    expect((await deleteBudget(ajeno.id)).ok).toBe(false) // auth() devuelve userId, no otherId
    expect((await deleteBudget(row!.id)).ok).toBe(true)
    expect(await prisma.budget.count({ where: { id: row!.id } })).toBe(0)
  })
})
