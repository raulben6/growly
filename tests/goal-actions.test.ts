import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const email = `goalact_${Date.now()}@growly.app`
let userId = ''
let otherId = ''
let foreignGoalId = ''

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  createGoal, updateGoal, archiveGoal, addContribution, deleteContribution,
} from '@/lib/goal-actions'

describe.skipIf(!process.env.DATABASE_URL)('goal actions', () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { name: 'GoalAct', email } })).id
    otherId = (await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })).id
    foreignGoalId = (await prisma.goal.create({
      data: { userId: otherId, name: 'Ajena', targetAmount: 100_000 },
    })).id
  })
  afterAll(async () => {
    await prisma.goalContribution.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.goal.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('createGoal crea una meta', async () => {
    const res = await createGoal({
      name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6', targetAmount: 500_000, targetDate: null,
    })
    expect(res.ok).toBe(true)
    expect(await prisma.goal.count({ where: { userId } })).toBe(1)
  })

  it('rechaza targetAmount 0 y colorHex inválido con mensaje en español', async () => {
    const r1 = await createGoal({ name: 'X', colorHex: '#3B82F6', targetAmount: 0 })
    expect(r1).toEqual({ ok: false, error: 'El objetivo debe ser mayor que 0' })
    const r2 = await createGoal({ name: 'X', colorHex: 'azul', targetAmount: 100 })
    expect(r2).toEqual({ ok: false, error: 'Color no válido' })
  })

  it('updateGoal de meta ajena → Meta no encontrada; id no-string → Datos inválidos', async () => {
    const res = await updateGoal(foreignGoalId, {
      name: 'Hack', colorHex: '#000000', targetAmount: 1,
    })
    expect(res).toEqual({ ok: false, error: 'Meta no encontrada' })
    expect(await updateGoal(123, { name: 'X', colorHex: '#000000', targetAmount: 1 }))
      .toEqual({ ok: false, error: 'Datos inválidos' })
  })

  it('addContribution a meta propia ok; a meta ajena → Meta no encontrada', async () => {
    const goal = await prisma.goal.findFirst({ where: { userId } })
    expect((await addContribution({ goalId: goal!.id, amount: 240_000, date: '2026-07-10' })).ok).toBe(true)
    const res = await addContribution({ goalId: foreignGoalId, amount: 10_000 })
    expect(res).toEqual({ ok: false, error: 'Meta no encontrada' })
  })

  it('deleteContribution valida id y ownership', async () => {
    expect(await deleteContribution(123)).toEqual({ ok: false, error: 'Datos inválidos' })
    const c = await prisma.goalContribution.findFirst({ where: { userId } })
    const foreign = await prisma.goalContribution.create({
      data: { goalId: foreignGoalId, userId: otherId, amount: 1_000 },
    })
    expect((await deleteContribution(foreign.id)).ok).toBe(false)
    expect((await deleteContribution(c!.id)).ok).toBe(true)
  })

  it('archiveGoal archiva la propia', async () => {
    const goal = await prisma.goal.findFirst({ where: { userId } })
    expect((await archiveGoal(goal!.id)).ok).toBe(true)
    expect((await prisma.goal.findUnique({ where: { id: goal!.id } }))!.archived).toBe(true)
  })
})
