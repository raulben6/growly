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

// spent = EXPENSE CLEARED del mes, con getters locales — misma convención que
// monthlyTotals en lib/dashboard: los KPIs y el presupuesto deben coincidir.
export function budgetProgress(
  budgets: BudgetLike[],
  txns: BudgetTx[],
  year: number,
  month: number,
): { categories: CategoryProgress[]; totals: BudgetTotals } {
  const spentByCat = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'EXPENSE' || t.status === 'PENDING' || !t.categoryId) continue
    if (t.date.getFullYear() !== year || t.date.getMonth() !== month) continue
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
