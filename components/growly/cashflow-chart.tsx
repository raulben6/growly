import { linePoints, type MonthPoint } from '@/lib/reports'
import { shortMonthName } from '@/lib/calendar'

const W = 640
const H = 200

export function CashflowChart({ series }: { series: MonthPoint[] }) {
  const max = Math.max(1, ...series.map((p) => Math.max(p.income, p.expense)))
  const income = linePoints(series.map((p) => p.income), W, H, max)
  const expense = linePoints(series.map((p) => p.expense), W, H, max)
  const last = series.length - 1
  return (
    <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4">
        <div className="text-base font-extrabold text-foreground">Flujo de caja</div>
        <div className="text-xs text-muted-foreground">Últimos 6 meses</div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="200"
        preserveAspectRatio="none"
        role="img"
        aria-label="Flujo de caja de los últimos 6 meses"
      >
        <line x1="0" y1="50" x2={W} y2="50" stroke="var(--line)" strokeWidth="1" />
        <line x1="0" y1="100" x2={W} y2="100" stroke="var(--line)" strokeWidth="1" />
        <line x1="0" y1="150" x2={W} y2="150" stroke="var(--line)" strokeWidth="1" />
        {income && (
          <>
            <polyline
              data-testid="cashflow-income"
              points={income}
              fill="none"
              stroke="#10b981"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline points={`${income} ${W},${H} 0,${H}`} fill="rgba(16,185,129,.1)" stroke="none" />
          </>
        )}
        {expense && (
          <polyline
            data-testid="cashflow-expense"
            points={expense}
            fill="none"
            stroke="#c9584f"
            strokeWidth="2.4"
            strokeDasharray="2 5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <div className="mt-2 flex justify-between px-1">
        {series.map((p, i) => (
          <span
            key={`${p.year}-${p.month}`}
            className={`text-[11px] ${i === last ? 'font-extrabold text-foreground' : 'text-muted-foreground'}`}
          >
            {shortMonthName(p.month)}
          </span>
        ))}
      </div>
    </div>
  )
}
