export type DashTx = {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  amount: number
  date: Date
  categoryId?: string | null
  status?: 'CLEARED' | 'PENDING'
}

const inMonth = (d: Date, year: number, month: number) =>
  d.getFullYear() === year && d.getMonth() === month
const isCleared = (t: { status?: string }) => t.status !== 'PENDING'

export function monthlyTotals(txns: DashTx[], year: number, month: number) {
  let income = 0
  let expense = 0
  for (const t of txns) {
    if (!isCleared(t) || !inMonth(t.date, year, month)) continue
    if (t.type === 'INCOME') income += t.amount
    else if (t.type === 'EXPENSE') expense += t.amount
  }
  const savings = income - expense
  const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0
  return { income, expense, savings, savingsRate }
}

export function categoryBreakdown(
  txns: DashTx[],
  categories: { id: string; name: string; colorHex: string }[],
  year: number,
  month: number,
) {
  const catById = new Map(categories.map((c) => [c.id, c]))
  const totals = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'EXPENSE' || !isCleared(t) || !inMonth(t.date, year, month)) continue
    const key = t.categoryId ?? 'none'
    totals.set(key, (totals.get(key) ?? 0) + t.amount)
  }
  return [...totals.entries()]
    .map(([id, total]) => {
      const c = id === 'none' ? undefined : catById.get(id)
      return { id, name: c?.name ?? 'Otros', colorHex: c?.colorHex ?? '#8A857E', total }
    })
    .sort((a, b) => b.total - a.total)
}

export function upcomingPayments<T extends { date: Date; status?: 'CLEARED' | 'PENDING' }>(
  txns: T[],
  now: Date,
  limit = 3,
): T[] {
  return txns
    .filter((t) => t.status === 'PENDING' && t.date.getTime() >= now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, limit)
}

export function recentTransactions<T extends { date: Date }>(txns: T[], limit = 5): T[] {
  return [...txns].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit)
}

import { getAccountsWithBalances } from '@/lib/accounts'
import { getTransactionsForUser } from '@/lib/transactions'
import { getCategoriesForUser } from '@/lib/categories'
import { materializeRecurringForUser } from '@/lib/recurring'
import { getBudgetsForMonth, budgetProgress } from '@/lib/budgets'

export async function getDashboardData(userId: string, now: Date) {
  await materializeRecurringForUser(userId, now)
  const [{ accounts }, txns, categories, budgets] = await Promise.all([
    getAccountsWithBalances(userId),
    getTransactionsForUser(userId),
    getCategoriesForUser(userId),
    getBudgetsForMonth(userId, now.getFullYear(), now.getMonth(), now),
  ])

  const total = accounts
    .filter((a) => a.type !== 'CREDIT_CARD')
    .reduce((s, a) => s + a.balance, 0)

  // comprometido debe sumar TODOS los pagos pendientes futuros, no solo los 3 que se muestran
  const allUpcoming = upcomingPayments(txns, now, Infinity)
  const comprometido = allUpcoming
    .filter((t) => t.type === 'EXPENSE')
    .reduce((s, t) => s + t.amount, 0)

  const catById = new Map(categories.map((c) => [c.id, c]))
  const progress = budgetProgress(budgets, txns, now.getFullYear(), now.getMonth())
  const budget =
    budgets.length === 0
      ? null
      : {
          totals: {
            limit: progress.totals.limit,
            spent: progress.totals.spent,
            pct: progress.totals.pct,
          },
          top: progress.categories.slice(0, 3).map((c) => ({
            categoryId: c.categoryId,
            name: catById.get(c.categoryId)?.name ?? 'Otros',
            colorHex: catById.get(c.categoryId)?.colorHex ?? '#8A857E',
            pct: c.pct,
            over: c.over,
          })),
        }

  return {
    total,
    comprometido,
    disponible: total - comprometido,
    monthly: monthlyTotals(txns, now.getFullYear(), now.getMonth()),
    breakdown: categoryBreakdown(
      txns,
      categories.map((c) => ({ id: c.id, name: c.name, colorHex: c.colorHex })),
      now.getFullYear(),
      now.getMonth(),
    ),
    upcoming: allUpcoming.slice(0, 3),
    // recientes = lo ya ocurrido; los PENDING futuros (p. ej. recurrencias materializadas) no son "recientes"
    recent: recentTransactions(
      txns.filter((t) => !(t.status === 'PENDING' && t.date.getTime() > now.getTime())),
      5,
    ),
    categories,
    budget,
  }
}
