import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getBudgetsForMonth, budgetProgress, budgetForecast } from '@/lib/budgets'
import { getTransactionsForUser } from '@/lib/transactions'
import { getCategoriesForUser } from '@/lib/categories'
import { parseMonthParam, isCurrentMonth } from '@/lib/month-param'
import { MonthNav } from '@/components/growly/month-nav'
import { BudgetHero } from '@/components/growly/budget-hero'
import { BudgetCategoryRow } from '@/components/growly/budget-category-row'
import { BudgetDialog } from '@/components/growly/budget-dialog'

export default async function PresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { m } = await searchParams
  const now = new Date()
  const ym = parseMonthParam(m, now)

  const [budgets, txns, categories] = await Promise.all([
    getBudgetsForMonth(userId, ym.year, ym.month, now),
    getTransactionsForUser(userId),
    getCategoriesForUser(userId),
  ])
  const catById = new Map(categories.map((c) => [c.id, c]))
  const { categories: rows, totals } = budgetProgress(budgets, txns, ym.year, ym.month)
  const forecast =
    isCurrentMonth(ym, now) && budgets.length > 0 ? budgetForecast(totals, now) : null

  const budgetedIds = new Set(budgets.map((b) => b.categoryId))
  const available = categories
    .filter((c) => c.kind === 'EXPENSE' && !budgetedIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Presupuesto</h1>
        <MonthNav ym={ym} basePath="/presupuesto" />
      </div>

      {budgets.length === 0 ? (
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <p className="mb-4 text-sm text-muted-foreground">
            Crea tu primer presupuesto: pon un límite mensual a tus categorías de gasto.
          </p>
          <div className="flex justify-center">
            <BudgetDialog year={ym.year} month={ym.month} categories={available} />
          </div>
        </div>
      ) : (
        <>
          <BudgetHero totals={totals} forecast={forecast} />
          <div className="rounded-[22px] border border-border bg-card px-5 pb-1 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between pt-4">
              <div className="text-base font-extrabold text-foreground">Por categoría</div>
              <BudgetDialog year={ym.year} month={ym.month} categories={available} />
            </div>
            <div className="divide-y divide-[var(--line)]">
              {rows.map((r) => {
                const cat = catById.get(r.categoryId)
                return (
                  <BudgetCategoryRow
                    key={r.budgetId}
                    year={ym.year}
                    month={ym.month}
                    row={{
                      budgetId: r.budgetId,
                      categoryId: r.categoryId,
                      name: cat?.name ?? 'Categoría',
                      colorHex: cat?.colorHex ?? '#8A857E',
                      limit: r.limit,
                      spent: r.spent,
                      pct: r.pct,
                      over: r.over,
                    }}
                  />
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
