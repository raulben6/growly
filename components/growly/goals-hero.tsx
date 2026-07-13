import { Money } from '@/components/growly/money'

export function GoalsHero({
  totalSaved, activeCount, savedThisMonth,
}: {
  totalSaved: number
  activeCount: number
  savedThisMonth: number
}) {
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-forest p-6 text-white shadow-[0_18px_40px_-18px_rgba(18,33,28,.5)]">
      <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,.4),transparent_70%)]" />
      <div className="mb-2 text-sm text-white/60">Total ahorrado en metas</div>
      <Money cents={totalSaved} withCents={false} className="text-[42px] font-extrabold tracking-[-0.03em]" />
      <div className="mt-3 text-sm text-white/70">
        {activeCount} {activeCount === 1 ? 'meta activa' : 'metas activas'} ·{' '}
        <b className="text-white">
          +<Money cents={savedThisMonth} withCents={false} />
        </b>{' '}
        este mes
      </div>
    </div>
  )
}
