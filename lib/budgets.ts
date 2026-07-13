export type BudgetLike = { id: string; categoryId: string; amount: number }

export type BudgetTx = {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  amount: number
  date: Date
  categoryId?: string | null
  status?: 'CLEARED' | 'PENDING'
}

export type CategoryProgress = {
  budgetId: string
  categoryId: string
  limit: number
  spent: number
  pct: number // redondeado, sin cap (puede superar 100)
  over: boolean
}

export type BudgetTotals = { limit: number; spent: number; pct: number; available: number }

// spent = EXPENSE CLEARED del mes. Fechas de datos = fecha-calendario a medianoche UTC
// → getters UTC; year/month = componentes locales de now (mismo criterio que lib/dashboard).
export function budgetProgress(
  budgets: BudgetLike[],
  txns: BudgetTx[],
  year: number,
  month: number,
): { categories: CategoryProgress[]; totals: BudgetTotals } {
  const spentByCat = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'EXPENSE' || t.status === 'PENDING' || !t.categoryId) continue
    if (t.date.getUTCFullYear() !== year || t.date.getUTCMonth() !== month) continue
    spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + t.amount)
  }

  const categories = budgets
    .map((b) => {
      const spent = spentByCat.get(b.categoryId) ?? 0
      return {
        budgetId: b.id,
        categoryId: b.categoryId,
        limit: b.amount,
        spent,
        pct: b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0,
        over: spent > b.amount,
      }
    })
    .sort((a, b) => b.pct - a.pct)

  const limit = categories.reduce((s, c) => s + c.limit, 0)
  const spent = categories.reduce((s, c) => s + c.spent, 0)
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0
  return { categories, totals: { limit, spent, pct, available: limit - spent } }
}

// Proyección run-rate del mes en curso: spent / días transcurridos × días del mes.
export function budgetForecast(totals: { spent: number }, now: Date): { projected: number; daysLeft: number } {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysElapsed = now.getDate()
  return {
    projected: Math.round((totals.spent / daysElapsed) * daysInMonth),
    daysLeft: daysInMonth - daysElapsed,
  }
}

import { prisma } from '@/lib/prisma'

// Lee los budgets del mes pedido. Auto-copia (spec F2 §6.1): solo si el mes pedido
// es el actual, está vacío y algún mes de los 12 anteriores tiene filas — se copia
// el más reciente. La copia es un único createMany (atómico); skipDuplicates + el
// unique [userId, categoryId, year, month] protegen contra la doble copia concurrente.
export async function getBudgetsForMonth(
  userId: string,
  year: number,
  month: number,
  now: Date = new Date(),
) {
  const existing = await prisma.budget.findMany({
    where: { userId, year, month },
    orderBy: { createdAt: 'asc' },
  })
  if (existing.length > 0) return existing
  if (year !== now.getFullYear() || month !== now.getMonth()) return existing

  // pares (year, month) de los 12 meses anteriores al pedido
  const pairs: { year: number; month: number }[] = []
  let y = year
  let m = month
  for (let i = 0; i < 12; i++) {
    m -= 1
    if (m < 0) { m = 11; y -= 1 }
    pairs.push({ year: y, month: m })
  }
  const latest = await prisma.budget.findFirst({
    where: { userId, OR: pairs },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { year: true, month: true },
  })
  if (!latest) return existing

  const source = await prisma.budget.findMany({
    where: { userId, year: latest.year, month: latest.month },
  })
  await prisma.budget.createMany({
    data: source.map((b) => ({ userId, categoryId: b.categoryId, year, month, amount: b.amount })),
    skipDuplicates: true,
  })
  return prisma.budget.findMany({ where: { userId, year, month }, orderBy: { createdAt: 'asc' } })
}

export function upsertBudgetForUser(
  userId: string,
  data: { categoryId: string; year: number; month: number; amount: number },
) {
  return prisma.budget.upsert({
    where: {
      userId_categoryId_year_month: {
        userId,
        categoryId: data.categoryId,
        year: data.year,
        month: data.month,
      },
    },
    create: { userId, ...data },
    update: { amount: data.amount },
  })
}

export async function deleteBudgetForUser(userId: string, id: string) {
  const res = await prisma.budget.deleteMany({ where: { id, userId } })
  return { ok: res.count > 0 }
}
