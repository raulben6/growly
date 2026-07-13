import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  getGoalsForUser, createGoalForUser, updateGoalForUser, archiveGoalForUser,
  addContributionForUser, deleteContributionForUser,
} from '@/lib/goals'

const email = `goal_${Date.now()}@growly.app`
let userId = ''
let otherId = ''
let goalA = ''
let goalB = ''

const now = new Date(2026, 6, 15) // "hoy" fijo: 15 jul 2026

describe.skipIf(!process.env.DATABASE_URL)('goals DB', () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { name: 'Goal', email } })).id
    otherId = (await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })).id
  })
  afterAll(async () => {
    await prisma.goalContribution.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.goal.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('createGoalForUser crea; getGoalsForUser ordena por createdAt asc', async () => {
    goalA = (await createGoalForUser(userId, {
      name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6', targetAmount: 500_000,
      targetDate: new Date(Date.UTC(2026, 11, 1)),
    })).id
    goalB = (await createGoalForUser(userId, {
      name: 'Fondo', emoji: '🛡️', colorHex: '#10B981', targetAmount: 1_000_000, targetDate: null,
    })).id
    const goals = await getGoalsForUser(userId, now)
    expect(goals.map((g) => g.name)).toEqual(['Viaje', 'Fondo'])
    expect(goals[0]).toMatchObject({ saved: 0, savedThisMonth: 0 })
  })

  it('aportes: saved/savedThisMonth correctos y contributions en orden date desc', async () => {
    await addContributionForUser(userId, { goalId: goalA, amount: 140_000, date: new Date(2026, 5, 20) })
    await addContributionForUser(userId, { goalId: goalA, amount: 60_000, date: new Date(2026, 6, 10), note: 'extra' })
    await addContributionForUser(userId, { goalId: goalA, amount: 40_000, date: new Date(2026, 6, 1) })
    const goals = await getGoalsForUser(userId, now)
    const viaje = goals.find((g) => g.id === goalA)!
    expect(viaje.saved).toBe(240_000)
    expect(viaje.savedThisMonth).toBe(100_000)
    expect(viaje.contributions.map((c) => c.amount)).toEqual([60_000, 40_000, 140_000])
    expect(viaje.contributions[0].note).toBe('extra')
  })

  it('addContributionForUser rechaza meta ajena sin crear nada', async () => {
    const res = await addContributionForUser(otherId, { goalId: goalA, amount: 10_000 })
    expect(res).toEqual({ ok: false })
    expect(await prisma.goalContribution.count({ where: { goalId: goalA } })).toBe(3)
  })

  it('updateGoalForUser respeta ownership y limpia campos opcionales', async () => {
    expect(await updateGoalForUser(otherId, goalA, {
      name: 'Hack', colorHex: '#000000', targetAmount: 1,
    })).toEqual({ ok: false })
    expect(await updateGoalForUser(userId, goalA, {
      name: 'Viaje a Japón', colorHex: '#3B82F6', targetAmount: 600_000,
    })).toEqual({ ok: true })
    const updated = await prisma.goal.findUnique({ where: { id: goalA } })
    expect(updated).toMatchObject({ name: 'Viaje a Japón', targetAmount: 600_000, emoji: null, targetDate: null })
  })

  it('deleteContributionForUser respeta ownership', async () => {
    const c = await prisma.goalContribution.findFirst({ where: { goalId: goalA, amount: 40_000 } })
    expect(await deleteContributionForUser(otherId, c!.id)).toEqual({ ok: false })
    expect(await deleteContributionForUser(userId, c!.id)).toEqual({ ok: true })
    expect((await getGoalsForUser(userId, now)).find((g) => g.id === goalA)!.saved).toBe(200_000)
  })

  it('archiveGoalForUser oculta la meta de getGoalsForUser', async () => {
    expect(await archiveGoalForUser(otherId, goalB)).toEqual({ ok: false })
    expect(await archiveGoalForUser(userId, goalB)).toEqual({ ok: true })
    const goals = await getGoalsForUser(userId, now)
    expect(goals.map((g) => g.id)).toEqual([goalA])
  })
})
