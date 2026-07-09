import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addDaysUTC } from '@/lib/recurrence'
import {
  materializeRecurringForUser,
  createRecurringRuleForUser, getRecurringRulesForUser,
  updateRecurringRuleForUser, setRecurringRuleActiveForUser, deleteRecurringRuleForUser,
} from '@/lib/recurring'

const email = `reccrud_${Date.now()}@growly.app`
const now = new Date()
let userId = ''
let accountId = ''

const baseRule = () => ({
  type: 'EXPENSE' as const, amount: 1600, accountId, categoryId: null,
  description: 'Gym', frequency: 'MONTHLY' as const,
  startDate: addDaysUTC(now, -40), endDate: null,
})

describe.skipIf(!process.env.DATABASE_URL)('CRUD de reglas recurrentes', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'RecCrud', email } })
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

  it('create + get devuelven la regla con account/category', async () => {
    const rule = await createRecurringRuleForUser(userId, baseRule())
    expect(rule.userId).toBe(userId)
    const list = await getRecurringRulesForUser(userId)
    expect(list.length).toBe(1)
    expect(list[0].account.name).toBe('C')
  })

  it('editar la regla borra las PENDING futuras y regenera con los nuevos valores', async () => {
    // startDate hace 40 días → materializa 2 vencidas (−40, ~−10) y 3 futuras (~+20, ~+50, ~+80)
    await materializeRecurringForUser(userId, now)
    const rule = (await getRecurringRulesForUser(userId))[0]
    const before = await prisma.transaction.findMany({ where: { recurringRuleId: rule.id } })
    const overdueBefore = before.filter((t) => t.date.getTime() <= now.getTime())
    const futureBefore = before.filter((t) => t.date.getTime() > now.getTime())
    expect(overdueBefore.length).toBe(2)
    expect(futureBefore.length).toBe(3)

    const res = await updateRecurringRuleForUser(userId, rule.id, { ...baseRule(), amount: 2000 }, now)
    expect(res.ok).toBe(true)
    // futuras borradas, vencidas intactas, marcador reseteado
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id, date: { gt: now } } })).toBe(0)
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id } })).toBe(2)

    await materializeRecurringForUser(userId, now)
    const regen = await prisma.transaction.findMany({ where: { recurringRuleId: rule.id, date: { gt: now } } })
    expect(regen.length).toBe(3)
    expect(regen.every((t) => t.amount === 2000)).toBe(true)
    expect(regen.every((t) => t.status === 'PENDING')).toBe(true)
  })

  it('pausar borra futuras y no regenera; reanudar regenera', async () => {
    const rule = (await getRecurringRulesForUser(userId))[0]
    expect((await setRecurringRuleActiveForUser(userId, rule.id, false, now)).ok).toBe(true)
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id, date: { gt: now } } })).toBe(0)
    await materializeRecurringForUser(userId, now)
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id, date: { gt: now } } })).toBe(0)
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id } })).toBe(2) // vencidas intactas

    expect((await setRecurringRuleActiveForUser(userId, rule.id, true, now)).ok).toBe(true)
    await materializeRecurringForUser(userId, now)
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id, date: { gt: now } } })).toBe(3)
  })

  it('borrar la regla elimina futuras PENDING y conserva el histórico con recurringRuleId null', async () => {
    const rule = (await getRecurringRulesForUser(userId))[0]
    // confirmamos una futura para simular histórico CLEARED
    const fut = await prisma.transaction.findFirst({ where: { recurringRuleId: rule.id, date: { gt: now } } })
    await prisma.transaction.update({ where: { id: fut!.id }, data: { status: 'CLEARED' } })

    expect((await deleteRecurringRuleForUser(userId, rule.id, now)).ok).toBe(true)
    expect(await prisma.recurringRule.count({ where: { userId } })).toBe(0)
    // la CLEARED futura sobrevive con la referencia a null; las PENDING futuras no
    const survivors = await prisma.transaction.findMany({ where: { userId, date: { gt: now } } })
    expect(survivors.length).toBe(1)
    expect(survivors[0].status).toBe('CLEARED')
    expect(survivors[0].recurringRuleId).toBeNull()
    // vencidas PENDING también sobreviven (para confirmarlas o borrarlas)
    expect(await prisma.transaction.count({ where: { userId, date: { lte: now }, status: 'PENDING' } })).toBe(2)
  })

  it('ownership: id ajeno → ok:false y no toca nada', async () => {
    expect((await updateRecurringRuleForUser('nadie', 'no-existe', baseRule())).ok).toBe(false)
    expect((await setRecurringRuleActiveForUser('nadie', 'no-existe', false)).ok).toBe(false)
    expect((await deleteRecurringRuleForUser('nadie', 'no-existe')).ok).toBe(false)
  })

  it('update con categoryId/endDate undefined los limpia (reemplazo completo)', async () => {
    const cat = await prisma.category.findFirst({ where: { userId: null, kind: 'EXPENSE' } })
    const rule = await createRecurringRuleForUser(userId, { ...baseRule(), categoryId: cat?.id ?? null, endDate: addDaysUTC(now, 60) })
    const res = await updateRecurringRuleForUser(userId, rule.id, {
      type: 'EXPENSE', amount: 1600, accountId, description: 'Gym', frequency: 'MONTHLY',
      startDate: addDaysUTC(now, -40),
      // categoryId y endDate omitidos a propósito (undefined)
    }, now)
    expect(res.ok).toBe(true)
    const updated = await prisma.recurringRule.findUnique({ where: { id: rule.id } })
    expect(updated!.categoryId).toBeNull()
    expect(updated!.endDate).toBeNull()
  })

  it('borrar dos veces: la segunda devuelve ok:false sin lanzar', async () => {
    const rule = await createRecurringRuleForUser(userId, baseRule())
    expect((await deleteRecurringRuleForUser(userId, rule.id, now)).ok).toBe(true)
    expect((await deleteRecurringRuleForUser(userId, rule.id, now)).ok).toBe(false)
  })
})
