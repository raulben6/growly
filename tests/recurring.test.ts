import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addDaysUTC } from '@/lib/recurrence'
import { materializeRecurringForUser, confirmTransactionForUser } from '@/lib/recurring'

const email = `rec_${Date.now()}@growly.app`
const now = new Date()
let userId = ''
let accountId = ''

describe.skipIf(!process.env.DATABASE_URL)('materializeRecurringForUser', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Rec Test', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    accountId = a.id
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.recurringRule.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('genera PENDING hasta 90 días y avanza materializedThrough', async () => {
    const rule = await prisma.recurringRule.create({
      data: {
        userId, accountId, type: 'EXPENSE', amount: 1600, description: 'Netflix',
        frequency: 'MONTHLY', startDate: addDaysUTC(now, 2),
      },
    })
    await materializeRecurringForUser(userId, now)
    const txns = await prisma.transaction.findMany({ where: { recurringRuleId: rule.id } })
    // mensual desde now+2d dentro de (now, now+90d]: exactamente 3 ocurrencias
    expect(txns.length).toBe(3)
    expect(txns.every((t) => t.status === 'PENDING')).toBe(true)
    expect(txns.every((t) => t.amount === 1600 && t.type === 'EXPENSE')).toBe(true)
    const updated = await prisma.recurringRule.findUnique({ where: { id: rule.id } })
    expect(updated!.materializedThrough!.getTime()).toBe(addDaysUTC(now, 90).getTime())
  })

  it('es idempotente: segunda llamada no crea nada', async () => {
    await materializeRecurringForUser(userId, now)
    const count = await prisma.transaction.count({ where: { userId, description: 'Netflix' } })
    expect(count).toBe(3)
  })

  it('una PENDING borrada NO se regenera (saltar una vez)', async () => {
    const one = await prisma.transaction.findFirst({ where: { userId, description: 'Netflix' } })
    await prisma.transaction.delete({ where: { id: one!.id } })
    await materializeRecurringForUser(userId, now)
    expect(await prisma.transaction.count({ where: { userId, description: 'Netflix' } })).toBe(2)
  })

  it('una regla pausada no genera', async () => {
    await prisma.recurringRule.create({
      data: {
        userId, accountId, type: 'EXPENSE', amount: 999, description: 'Pausada',
        frequency: 'MONTHLY', startDate: addDaysUTC(now, 1), active: false,
      },
    })
    await materializeRecurringForUser(userId, now)
    expect(await prisma.transaction.count({ where: { userId, description: 'Pausada' } })).toBe(0)
  })

  it('respeta endDate', async () => {
    await prisma.recurringRule.create({
      data: {
        userId, accountId, type: 'INCOME', amount: 5000, description: 'Corta',
        frequency: 'WEEKLY', startDate: addDaysUTC(now, 1), endDate: addDaysUTC(now, 20),
      },
    })
    await materializeRecurringForUser(userId, now)
    // semanal desde now+1d hasta now+20d: días +1, +8, +15 → 3
    expect(await prisma.transaction.count({ where: { userId, description: 'Corta' } })).toBe(3)
  })

  it('no escribe cuando no hay ocurrencias nuevas (regla más allá del horizonte)', async () => {
    const rule = await prisma.recurringRule.create({
      data: {
        userId, accountId, type: 'EXPENSE', amount: 100, description: 'Lejana',
        frequency: 'MONTHLY', startDate: addDaysUTC(now, 120),
      },
    })
    await materializeRecurringForUser(userId, now)
    let r = await prisma.recurringRule.findUnique({ where: { id: rule.id } })
    expect(r!.materializedThrough).toBeNull()
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id } })).toBe(0)
    // cuando el tiempo avanza y la primera ocurrencia entra al horizonte, crea y avanza el marcador
    const later = addDaysUTC(now, 40)
    await materializeRecurringForUser(userId, later)
    r = await prisma.recurringRule.findUnique({ where: { id: rule.id } })
    expect(r!.materializedThrough?.getTime()).toBe(addDaysUTC(later, 90).getTime())
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id } })).toBeGreaterThan(0)
  })
})

describe.skipIf(!process.env.DATABASE_URL)('confirmTransactionForUser', () => {
  let confUserId = ''
  let confAccountId = ''

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Confirm Test', email: `conf_${Date.now()}@growly.app` } })
    confUserId = u.id
    const a = await prisma.account.create({ data: { userId: confUserId, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    confAccountId = a.id
  })

  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: confUserId } })
    await prisma.recurringRule.deleteMany({ where: { userId: confUserId } })
    await prisma.account.deleteMany({ where: { userId: confUserId } })
    await prisma.user.delete({ where: { id: confUserId } })
  })

  it('PENDING → CLEARED; segunda vez ok:false; ajena ok:false', async () => {
    const t = await prisma.transaction.create({
      data: {
        userId: confUserId, accountId: confAccountId, type: 'EXPENSE', amount: 1000, description: 'Confirmable',
        date: addDaysUTC(now, -1), status: 'PENDING',
      },
    })
    expect(await confirmTransactionForUser(confUserId, t.id)).toEqual({ ok: true })
    const after = await prisma.transaction.findUnique({ where: { id: t.id } })
    expect(after!.status).toBe('CLEARED')
    expect(after!.date.getTime()).toBe(addDaysUTC(now, -1).getTime()) // la fecha no cambia
    expect(await confirmTransactionForUser(confUserId, t.id)).toEqual({ ok: false })
    expect(await confirmTransactionForUser('otro-user', t.id)).toEqual({ ok: false })
  })
})
