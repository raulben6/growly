import { formatMoney } from '@/lib/money'

export function CategoryDonut({
  breakdown,
}: {
  breakdown: { id: string; name: string; colorHex: string; total: number }[]
}) {
  const total = breakdown.reduce((s, b) => s + b.total, 0)

  if (breakdown.length === 0 || total === 0) {
    return (
      <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 text-base font-extrabold text-foreground">Categorías</div>
        <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>
      </div>
    )
  }

  let acc = 0
  const stops = breakdown
    .map((b) => {
      const start = (acc / total) * 100
      acc += b.total
      const end = (acc / total) * 100
      return `${b.colorHex} ${start}% ${end}%`
    })
    .join(', ')

  return (
    <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 text-base font-extrabold text-foreground">Categorías</div>
      <div className="mb-4 flex justify-center">
        <div
          className="flex h-[130px] w-[130px] items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${stops})` }}
        >
          <div className="flex h-[84px] w-[84px] flex-col items-center justify-center rounded-full bg-card">
            <span className="text-xl font-extrabold text-foreground">{formatMoney(total, { withCents: false })}</span>
            <span className="text-[10px] text-muted-foreground">gastado</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {breakdown.map((b) => (
          <div key={b.id} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: b.colorHex }} />
            <span className="flex-1 text-muted-foreground">{b.name}</span>
            <span className="font-bold text-foreground">{formatMoney(b.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
