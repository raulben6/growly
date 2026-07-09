import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addDaysUTC } from '@/lib/recurrence'

const email = `recact_${Date.now()}@growly.app`
let userId = ''
let accountId = ''

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  createRecurringRule, updateRecurringRule, setRecurringRuleActive,
  deleteRecurringRule, confirmTransaction,
} from '@/lib/recurring-actions'

const now = new Date()
const iso = (d: Date) => d.toISOString().slice(0, 10)

describe.skipIf(!process.env.DATABASE_URL)('recurring actions', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'RecAct', email } })
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

  it('createRecurringRule crea la regla', async () => {
    const res = await createRecurringRule({
      type: 'EXPENSE', amount: 1600, accountId, categoryId: null, description: 'Netflix',
      frequency: 'MONTHLY', startDate: iso(addDaysUTC(now, 2)), endDate: null,
    })
    expect(res.ok).toBe(true)
    expect(await prisma.recurringRule.count({ where: { userId } })).toBe(1)
  })

  it('rechaza startDate en el pasado (al crear)', async () => {
    const res = await createRecurringRule({
      type: 'EXPENSE', amount: 1600, accountId, description: 'Vieja',
      frequency: 'MONTHLY', startDate: iso(addDaysUTC(now, -30)),
    })
    expect(res.ok).toBe(false)
  })

  it('rechaza cuenta ajena', async () => {
    const res = await createRecurringRule({
      type: 'EXPENSE', amount: 1600, accountId: 'cuenta-ajena-000', description: 'x',
      frequency: 'MONTHLY', startDate: iso(addDaysUTC(now, 2)),
    })
    expect(res.ok).toBe(false)
  })

  it('rechaza endDate anterior a startDate', async () => {
    const res = await createRecurringRule({
      type: 'EXPENSE', amount: 1600, accountId, description: 'x',
      frequency: 'MONTHLY', startDate: iso(addDaysUTC(now, 10)), endDate: iso(addDaysUTC(now, 5)),
    })
    expect(res.ok).toBe(false)
  })

  it('updateRecurringRule acepta startDate pasada (regla existente)', async () => {
    const rule = await prisma.recurringRule.findFirst({ where: { userId } })
    const res = await updateRecurringRule(rule!.id, {
      type: 'EXPENSE', amount: 2000, accountId, categoryId: null, description: 'Netflix 4K',
      frequency: 'MONTHLY', startDate: iso(addDaysUTC(now, -60)), endDate: null,
    })
    expect(res.ok).toBe(true)
    const updated = await prisma.recurringRule.findUnique({ where: { id: rule!.id } })
    expect(updated!.amount).toBe(2000)
  })

  it('setRecurringRuleActive pausa y reanuda', async () => {
    const rule = await prisma.recurringRule.findFirst({ where: { userId } })
    expect((await setRecurringRuleActive(rule!.id, false)).ok).toBe(true)
    expect((await prisma.recurringRule.findUnique({ where: { id: rule!.id } }))!.active).toBe(false)
    expect((await setRecurringRuleActive(rule!.id, true)).ok).toBe(true)
  })

  it('confirmTransaction confirma una PENDING propia', async () => {
    const t = await prisma.transaction.create({
      data: {
        userId, accountId, type: 'EXPENSE', amount: 500, description: 'Pendiente',
        date: addDaysUTC(now, -1), status: 'PENDING',
      },
    })
    expect((await confirmTransaction(t.id)).ok).toBe(true)
    expect((await prisma.transaction.findUnique({ where: { id: t.id } }))!.status).toBe('CLEARED')
  })

  it('deleteRecurringRule borra la regla', async () => {
    const rule = await prisma.recurringRule.findFirst({ where: { userId } })
    expect((await deleteRecurringRule(rule!.id)).ok).toBe(true)
    expect(await prisma.recurringRule.count({ where: { userId } })).toBe(0)
  })
})
