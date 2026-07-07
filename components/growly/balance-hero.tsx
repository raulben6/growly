import { Money } from '@/components/growly/money'

export function BalanceHero({
  disponible, total, comprometido,
}: {
  disponible: number
  total: number
  comprometido: number
}) {
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-forest p-6 text-white shadow-[0_18px_40px_-18px_rgba(18,33,28,.5)]">
      <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,.4),transparent_70%)]" />
      <div className="mb-2 text-sm text-white/60">Saldo disponible</div>
      <Money cents={disponible} className="text-[42px] font-extrabold tracking-[-0.03em]" />
      <div className="mt-3 flex gap-4 text-sm text-white/70">
        <span>Total <b className="text-white"><Money cents={total} /></b></span>
        <span>Comprometido <b className="text-white"><Money cents={comprometido} /></b></span>
      </div>
    </div>
  )
}
