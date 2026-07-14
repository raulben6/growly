import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getDashboardData } from '@/lib/dashboard'
import { BalanceHero } from '@/components/growly/balance-hero'
import { KpiCard } from '@/components/growly/kpi-card'
import { CategoryDonut } from '@/components/growly/category-donut'
import { TransactionRow } from '@/components/growly/transaction-row'
import { Money } from '@/components/growly/money'
import { BudgetCard } from '@/components/growly/budget-card'
import { GoalsCard } from '@/components/growly/goals-card'
import { CashflowChart } from '@/components/growly/cashflow-chart'
import { shortMonthName } from '@/lib/calendar'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const d = await getDashboardData(session.user.id, new Date())
  const catById = new Map(d.categories.map((c) => [c.id, c]))

  const prevShort = shortMonthName(d.cashflow[d.cashflow.length - 2].month)
  const deltaText = (pct: number) =>
    `${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)}% vs ${prevShort}`

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="md:col-span-1"><BalanceHero disponible={d.disponible} total={d.total} comprometido={d.comprometido} /></div>
        <KpiCard
          label="Ingresos"
          cents={d.monthly.income}
          accent="income"
          delta={d.deltas.incomePct === null ? null : { text: deltaText(d.deltas.incomePct), good: d.deltas.incomePct >= 0 }}
        />
        <KpiCard
          label="Gastos"
          cents={d.monthly.expense}
          accent="expense"
          delta={d.deltas.expensePct === null ? null : { text: deltaText(d.deltas.expensePct), good: d.deltas.expensePct <= 0 }}
        />
        <KpiCard label="Ahorro" cents={d.monthly.savings} accent="neutral" signed subtitle={`${d.monthly.savingsRate}% tasa`} />
      </div>

      <div className="grid gap-4 md:grid-cols-[1.8fr_1fr]">
        <CashflowChart series={d.cashflow} />
        <CategoryDonut breakdown={d.breakdown} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <BudgetCard summary={d.budget} />

        <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 text-base font-extrabold text-foreground">Próximos pagos</div>
          {d.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay pagos próximos.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--line)]">
              {d.upcoming.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-3">
                  <span className="text-sm font-bold text-foreground">{t.description}</span>
                  <Money cents={t.amount} className="text-sm font-extrabold" />
                </div>
              ))}
            </div>
          )}
        </div>

        <GoalsCard goals={d.goals} />
      </div>

      <div className="rounded-[20px] border border-border bg-card px-6 py-4 shadow-[var(--shadow-card)]">
        <div className="mb-2 text-base font-extrabold text-foreground">Movimientos recientes</div>
        {d.recent.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Aún no hay movimientos.</p>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--line)]">
            {d.recent.map((t) => {
              const cat = t.categoryId ? catById.get(t.categoryId) : null
              const signed = t.type === 'INCOME' ? t.amount : -t.amount
              return (
                <TransactionRow
                  key={t.id}
                  description={t.description}
                  meta={t.type === 'INCOME' ? 'Ingreso' : t.type === 'TRANSFER' ? 'Transferencia' : (cat?.name ?? 'Gasto')}
                  signedCents={signed}
                  iconName={cat?.icon ?? 'ellipsis'}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
