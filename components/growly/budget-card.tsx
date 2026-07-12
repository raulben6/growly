import Link from 'next/link'
import { Money } from '@/components/growly/money'

const OVER = '#C9584F'

export type BudgetSummary = {
  totals: { limit: number; spent: number; pct: number }
  top: { categoryId: string; name: string; colorHex: string; pct: number; over: boolean }[]
}

export function BudgetCard({ summary }: { summary: BudgetSummary | null }) {
  if (!summary) {
    return (
      <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-2 text-base font-extrabold text-foreground">Presupuesto</div>
        <p className="text-sm text-muted-foreground">
          Sin presupuesto este mes.{' '}
          <Link href="/presupuesto" className="font-bold text-acc underline-offset-2 hover:underline">
            Crear presupuesto
          </Link>
        </p>
      </div>
    )
  }

  const { totals, top } = summary
  const tone =
    totals.pct > 100
      ? 'bg-destructive/15 text-destructive'
      : totals.pct >= 85
        ? 'bg-warning/15 text-warning'
        : 'bg-acc/15 text-acc'

  return (
    <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-base font-extrabold text-foreground">Presupuesto</div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${tone}`}>
          {totals.pct}%
        </span>
      </div>
      <div className="text-sm text-muted-foreground">
        <b className="text-foreground">
          <Money cents={totals.spent} withCents={false} />
        </b>{' '}
        / <Money cents={totals.limit} withCents={false} />
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted">
        <div
          data-testid="budget-card-bar"
          className={`h-2 rounded-full ${totals.pct > 100 ? 'bg-destructive' : 'bg-acc'}`}
          style={{ width: `${Math.min(totals.pct, 100)}%` }}
        />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {top.map((c) => (
          <div key={c.categoryId} className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.colorHex }} />
            <span className="min-w-0 flex-1 truncate font-bold text-foreground">{c.name}</span>
            <span className="font-extrabold text-foreground" style={c.over ? { color: OVER } : undefined}>
              {c.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
