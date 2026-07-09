import { prisma } from '@/lib/prisma'
import { nextOccurrences, addDaysUTC } from '@/lib/recurrence'
import type { RecurrenceFrequency } from '@/lib/recurrence'

export const HORIZON_DAYS = 90

// Materialización perezosa e idempotente: crea los PENDING que falten hasta
// `now + HORIZON_DAYS` y avanza materializedThrough — ambos en la misma transacción.
// Nunca genera detrás de materializedThrough: borrar una ocurrencia = saltarla.
// Si una regla no tiene ocurrencias en el horizonte, no se escribe nada y se re-evaluará
// barata en la próxima llamada.
export async function materializeRecurringForUser(userId: string, now: Date = new Date()) {
  const horizon = addDaysUTC(now, HORIZON_DAYS)
  const rules = await prisma.recurringRule.findMany({
    where: {
      userId,
      active: true,
      OR: [{ materializedThrough: null }, { materializedThrough: { lt: horizon } }],
    },
  })
  for (const rule of rules) {
    const fromExclusive = rule.materializedThrough ?? new Date(rule.startDate.getTime() - 1)
    const dates = nextOccurrences(rule, fromExclusive, horizon)
    if (dates.length === 0) continue
    await prisma.$transaction([
      prisma.transaction.createMany({
        data: dates.map((date) => ({
          userId,
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          type: rule.type,
          amount: rule.amount,
          description: rule.description,
          date,
          status: 'PENDING' as const,
          recurringRuleId: rule.id,
        })),
        skipDuplicates: true,
      }),
      prisma.recurringRule.update({ where: { id: rule.id }, data: { materializedThrough: horizon } }),
    ])
  }
}

export async function confirmTransactionForUser(userId: string, id: string) {
  const res = await prisma.transaction.updateMany({
    where: { id, userId, status: 'PENDING' },
    data: { status: 'CLEARED' },
  })
  return { ok: res.count > 0 }
}

export type RecurringRuleData = {
  type: 'INCOME' | 'EXPENSE'
  amount: number
  accountId: string
  categoryId?: string | null
  description: string
  frequency: RecurrenceFrequency
  startDate: Date
  endDate?: Date | null
}

export function getRecurringRulesForUser(userId: string) {
  return prisma.recurringRule.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: {
      account: { select: { name: true } },
      category: { select: { name: true, icon: true } },
    },
  })
}

export function createRecurringRuleForUser(userId: string, data: RecurringRuleData) {
  return prisma.recurringRule.create({ data: { ...data, userId } })
}

// Editar una regla: sus PENDING futuras se borran y el marcador vuelve a `now`,
// de modo que la próxima materialización regenera la serie con los valores nuevos.
// Lo pasado y lo CLEARED no se toca.
export function updateRecurringRuleForUser(
  userId: string, id: string, data: RecurringRuleData, now: Date = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.recurringRule.updateMany({
      where: { id, userId },
      data: { ...data, categoryId: data.categoryId ?? null, endDate: data.endDate ?? null, materializedThrough: now },
    })
    if (updated.count === 0) return { ok: false }
    await tx.transaction.deleteMany({
      where: { recurringRuleId: id, userId, status: 'PENDING', date: { gt: now } },
    })
    return { ok: true }
  })
}

export function setRecurringRuleActiveForUser(
  userId: string, id: string, active: boolean, now: Date = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.recurringRule.updateMany({
      where: { id, userId },
      data: active ? { active: true, materializedThrough: now } : { active: false },
    })
    if (updated.count === 0) return { ok: false }
    if (!active) {
      await tx.transaction.deleteMany({
        where: { recurringRuleId: id, userId, status: 'PENDING', date: { gt: now } },
      })
    }
    return { ok: true }
  })
}

export function deleteRecurringRuleForUser(userId: string, id: string, now: Date = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.transaction.deleteMany({
      where: { recurringRuleId: id, userId, status: 'PENDING', date: { gt: now } },
    }) // histórico queda con SetNull
    const deleted = await tx.recurringRule.deleteMany({ where: { id, userId } })
    return { ok: deleted.count > 0 }
  })
}
