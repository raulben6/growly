import type * as React from 'react'
import { CategoryIcon } from '@/components/growly/category-icon'
import { SignedAmount } from '@/components/growly/money'

export function TransactionRow({
  description, meta, signedCents, iconName = 'ellipsis', badge, action,
}: {
  description: string
  meta: string
  signedCents: number
  iconName?: string
  badge?: { label: string; tone: 'danger' | 'muted' }
  action?: React.ReactNode
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
      {badge && (
        <span
          className={
            badge.tone === 'danger'
              ? 'rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-bold text-destructive'
              : 'rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground'
          }
        >
          {badge.label}
        </span>
      )}
      <SignedAmount cents={signedCents} className="text-[15px] font-extrabold" />
      {action}
    </div>
  )
}
