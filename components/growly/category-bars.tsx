import { Money } from '@/components/growly/money'
import type { RangeCategoryTotal } from '@/lib/reports'

export function CategoryBars({ items }: { items: RangeCategoryTotal[] }) {
  const max = Math.max(1, ...items.map((c) => c.total))
  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3.5 text-sm font-extrabold text-foreground">Top categorías</div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin gastos en este periodo.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((c) => (
            <div key={c.id}>
              <div className="mb-1.5 flex justify-between">
                <span className="text-[13px] font-semibold text-muted-foreground">{c.name}</span>
                <Money cents={c.total} withCents={false} className="text-[13px] font-extrabold text-foreground" />
              </div>
              <div className="h-1.5 overflow-hidden rounded-[3px] bg-muted">
                <div
                  data-testid={`catbar-${c.id}`}
                  className="h-full rounded-[3px]"
                  style={{ width: `${Math.round((c.total / max) * 100)}%`, backgroundColor: c.colorHex }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
