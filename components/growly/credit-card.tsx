import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

export function CreditCardView({
  name, used, limit, pct,
}: {
  name: string
  used: number
  limit: number
  pct: number
}) {
  const high = pct >= 90
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-forest p-6 text-white shadow-[0_16px_34px_-14px_rgba(18,33,28,.55)]">
      <div className="absolute -right-5 -top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,.3),transparent_70%)]" />
      <div className="mb-8 flex items-start justify-between">
        <span className="text-sm font-extrabold tracking-wide">{name}</span>
        <div className="h-5 w-8 rounded bg-white/15" />
      </div>
      <div className="mb-4 font-mono text-base tracking-[3px] text-white/90">···· ···· ···· ····</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-white/50">Saldo usado</div>
          <div className="text-lg font-extrabold">{formatMoney(used)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/50">Límite</div>
          <div className="text-sm font-bold text-white/85">{formatMoney(limit, { withCents: false })}</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <div className="mt-1.5 text-right">
          <span className={cn('text-xs font-bold', high ? 'text-destructive' : 'text-white')}>{pct}%</span>
        </div>
      </div>
    </div>
  )
}
