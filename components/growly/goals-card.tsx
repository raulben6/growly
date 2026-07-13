import Link from 'next/link'

export type GoalsSummaryItem = {
  id: string
  name: string
  emoji: string | null
  colorHex: string
  pct: number
  barPct: number
}

export function GoalsCard({ goals }: { goals: GoalsSummaryItem[] }) {
  if (goals.length === 0) {
    return (
      <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-2 text-base font-extrabold text-foreground">Metas de ahorro</div>
        <p className="text-sm text-muted-foreground">
          Aún no tienes metas.{' '}
          <Link href="/metas" className="font-bold text-acc underline-offset-2 hover:underline">
            Crear meta
          </Link>
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-3 text-base font-extrabold text-foreground">Metas de ahorro</div>
      <div className="flex flex-col gap-3">
        {goals.map((g) => (
          <div key={g.id}>
            <div className="flex items-center gap-2 text-sm">
              <span aria-hidden>{g.emoji ?? '🎯'}</span>
              <span className="min-w-0 flex-1 truncate font-bold text-foreground">{g.name}</span>
              <span className="text-xs font-extrabold text-muted-foreground">{g.pct}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div
                data-testid="goals-card-bar"
                className="h-1.5 rounded-full"
                style={{ width: `${g.barPct}%`, backgroundColor: g.colorHex }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
