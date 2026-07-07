import { CategoryIcon } from '@/components/growly/category-icon'
import { SignedAmount } from '@/components/growly/money'

export function TransactionRow({
  description, meta, signedCents, iconName = 'ellipsis',
}: {
  description: string
  meta: string
  signedCents: number
  iconName?: string
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <CategoryIcon name={iconName} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-foreground">{description}</div>
        <div className="text-xs text-muted-foreground">{meta}</div>
      </div>
      <SignedAmount cents={signedCents} className="text-[15px] font-extrabold" />
    </div>
  )
}
