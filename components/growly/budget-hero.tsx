import { Money } from '@/components/growly/money'
import type { BudgetTotals } from '@/lib/budgets'

// El hero es oscuro (bg-forest) en ambos temas → colores fijos, como BalanceHero:
// verde #34d399 para la barra normal, rojos claros legibles sobre forest al exceder.
export function BudgetHero({
  totals, forecast,
}: {
  totals: BudgetTotals
  forecast?: { projected: number; daysLeft: number } | null
}) {
  const barPct = Math.min(totals.pct, 100)
  const overBudget = totals.pct > 100
  const overProjection = !!forecast && forecast.projected > totals.limit
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-forest p-6 text-white shadow-[0_18px_40px_-18px_rgba(18,33,28,.5)]">
      <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,.4),transparent_70%)]" />
      <div className="mb-2 text-sm text-white/60">
        Gastado de <Money cents={totals.limit} withCents={false} />
      </div>
      <div className="flex items-end justify-between gap-4">
        <Money cents={totals.spent} withCents={false} className="text-[42px] font-extrabold tracking-[-0.03em]" />
        <div className="pb-2 text-sm text-white/70">
          <b className="text-white"><Money cents={totals.available} signed withCents={false} /></b> disponible
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-white/15">
        <div
          data-testid="budget-hero-bar"
          className={`h-2 rounded-full ${overBudget ? 'bg-[#e0685e]' : 'bg-[#34d399]'}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="mt-3 text-sm text-white/70">
        {totals.pct}% del presupuesto usado{forecast ? ` · quedan ${forecast.daysLeft} días` : ''}
      </div>
      {forecast && (
        <div className={`mt-1 text-sm font-bold ${overProjection ? 'text-[#ffb4ab]' : 'text-white/70'}`}>
          A este ritmo: ~<Money cents={forecast.projected} withCents={false} /> este mes
        </div>
      )}
    </div>
  )
}
