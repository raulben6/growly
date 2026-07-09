import { prisma } from '@/lib/prisma'
import { nextOccurrences, addDaysUTC } from '@/lib/recurrence'

export const HORIZON_DAYS = 90

// Materialización perezosa e idempotente: crea los PENDING que falten hasta
// `now + HORIZON_DAYS` y avanza materializedThrough — ambos en la misma transacción.
// Nunca genera detrás de materializedThrough: borrar una ocurrencia = saltarla.
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
    await prisma.$transaction([
      ...(dates.length
        ? [prisma.transaction.createMany({
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
          })]
        : []),
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
