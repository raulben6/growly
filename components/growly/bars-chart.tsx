import type { MonthPoint } from '@/lib/reports'
import { shortMonthName } from '@/lib/calendar'

export function BarsChart({ series }: { series: MonthPoint[] }) {
  const max = Math.max(1, ...series.map((p) => Math.max(p.income, p.expense)))
  const last = series.length - 1
  return (
    <div className="rounded-[22px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[15px] font-extrabold text-foreground">Ingresos vs Gastos</span>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-acc" aria-hidden /> Ing.
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-destructive" aria-hidden /> Gasto
          </span>
        </div>
      </div>
      <div className="flex h-[130px] items-end justify-between gap-3">
        {series.map((p, i) => (
          <div key={`${p.year}-${p.month}`} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-[110px] items-end gap-1">
              <div
                data-testid={`bar-income-${i}`}
                className="w-[11px] rounded-[3px] bg-acc"
                style={{ height: `${Math.round((p.income / max) * 100)}%` }}
              />
              <div
                data-testid={`bar-expense-${i}`}
                className="w-[11px] rounded-[3px] bg-destructive"
                style={{ height: `${Math.round((p.expense / max) * 100)}%` }}
              />
            </div>
            <span
              className={`text-[10px] ${i === last ? 'font-extrabold text-foreground' : 'font-semibold text-muted-foreground'}`}
            >
              {shortMonthName(p.month)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
