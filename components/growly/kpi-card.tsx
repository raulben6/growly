import { Money } from '@/components/growly/money'
import { cn } from '@/lib/utils'

export function KpiCard({
  label, cents, accent = 'neutral', subtitle, signed = false,
}: {
  label: string
  cents: number
  accent?: 'income' | 'expense' | 'neutral'
  subtitle?: string
  signed?: boolean
}) {
  const dot = accent === 'income' ? 'bg-primary/15 text-primary'
    : accent === 'expense' ? 'bg-destructive/15 text-destructive'
    : 'bg-info/15 text-info'
  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className={cn('mb-3 flex h-8 w-8 items-center justify-center rounded-[10px]', dot)}>
        <span className="text-sm font-extrabold">$</span>
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <Money cents={cents} signed={signed} className="text-2xl font-extrabold text-foreground" />
      {subtitle && <div className="mt-1 text-xs font-bold text-acc">{subtitle}</div>}
    </div>
  )
}
