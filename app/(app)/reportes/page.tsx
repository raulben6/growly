import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getTransactionsForUser } from '@/lib/transactions'
import { getCategoriesForUser } from '@/lib/categories'
import { monthlySeries, reportKpis, categoryTotalsForRange } from '@/lib/reports'
import { shortMonthName } from '@/lib/calendar'
import { formatMoney } from '@/lib/money'
import { BarsChart } from '@/components/growly/bars-chart'
import { ReportStat } from '@/components/growly/report-stat'
import { CategoryBars } from '@/components/growly/category-bars'

const tabCls = (active: boolean) =>
  `rounded-[11px] px-4 py-2 text-sm font-bold ${
    active ? 'bg-forest text-white' : 'border border-border bg-card text-muted-foreground'
  }`

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { p } = await searchParams
  const months = p === '1a' ? 12 : 6
  const now = new Date()

  const [txns, categories] = await Promise.all([
    getTransactionsForUser(session.user.id),
    getCategoriesForUser(session.user.id),
  ])
  const series = monthlySeries(txns, now, months)
  const kpis = reportKpis(series, now)
  const top = categoryTotalsForRange(
    txns,
    categories.map((c) => ({ id: c.id, name: c.name, colorHex: c.colorHex })),
    { year: series[0].year, month: series[0].month },
    { year: series[series.length - 1].year, month: series[series.length - 1].month },
  ).slice(0, 5)
  const hasData = series.some((pt) => pt.income > 0 || pt.expense > 0)
  const prevLabel = shortMonthName(series[series.length - 2].month)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Reportes</h1>
        <div className="flex gap-2">
          <Link href="/reportes" className={tabCls(months === 6)}>6 meses</Link>
          <Link href="/reportes?p=1a" className={tabCls(months === 12)}>Año</Link>
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">
            Aún no hay datos suficientes. Registra movimientos para ver tus estadísticas.
          </p>
        </div>
      ) : (
        <>
          <BarsChart series={series} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <ReportStat
              label="Tasa de ahorro"
              value={`${kpis.savingsRate}%`}
              delta={
                kpis.savingsRateDelta === null
                  ? null
                  : {
                      text: `${kpis.savingsRateDelta >= 0 ? '+' : '−'}${Math.abs(kpis.savingsRateDelta)} pts vs ${prevLabel}`,
                      good: kpis.savingsRateDelta >= 0,
                    }
              }
            />
            <ReportStat
              label="Gasto medio/día"
              value={formatMoney(kpis.avgDailyExpense, { withCents: false })}
              delta={
                kpis.avgDailyExpenseDelta === null
                  ? null
                  : {
                      text: `${kpis.avgDailyExpenseDelta <= 0 ? '−' : '+'}${formatMoney(Math.abs(kpis.avgDailyExpenseDelta), { withCents: false })} vs ${prevLabel}`,
                      good: kpis.avgDailyExpenseDelta <= 0,
                    }
              }
            />
          </div>
          <CategoryBars items={top} />
        </>
      )}
    </div>
  )
}
