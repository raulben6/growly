import { prisma } from '@/lib/prisma'
import type { TransactionFormValues } from '@/lib/validators'

export function createTransactionForUser(userId: string, data: TransactionFormValues) {
  return prisma.transaction.create({ data: { ...data, userId } })
}

export function getTransactionsForUser(
  userId: string,
  opts: { kind?: 'INCOME' | 'EXPENSE' } = {},
) {
  return prisma.transaction.findMany({
    where: { userId, ...(opts.kind ? { type: opts.kind } : {}) },
    orderBy: { date: 'desc' },
  })
}

export function deleteTransactionForUser(userId: string, id: string) {
  return prisma.transaction.deleteMany({ where: { id, userId } })
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
// Los movimientos guardan una fecha-calendario a medianoche UTC (input type=date →
// z.coerce.date). Se agrupan y etiquetan con getters UTC; "hoy/ayer" es el día de
// calendario LOCAL del usuario (now es un instante real).
const dayKeyUTC = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
const dayKeyLocal = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export function groupTransactionsByDay<T extends { date: Date }>(
  txns: T[],
  now: Date,
): { label: string; key: string; items: T[] }[] {
  const sorted = [...txns].sort((a, b) => b.date.getTime() - a.date.getTime())
  const todayKey = dayKeyLocal(now)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yKey = dayKeyLocal(yesterday)

  const groups: { label: string; key: string; items: T[] }[] = []
  const index = new Map<string, { label: string; key: string; items: T[] }>()
  for (const t of sorted) {
    const key = dayKeyUTC(t.date)
    let g = index.get(key)
    if (!g) {
      const label =
        key === todayKey ? 'Hoy' : key === yKey ? 'Ayer' : `${t.date.getUTCDate()} ${MESES[t.date.getUTCMonth()]}`
      g = { label, key, items: [] }
      index.set(key, g)
      groups.push(g)
    }
    g.items.push(t)
  }
  return groups
}
