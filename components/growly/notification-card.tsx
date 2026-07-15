'use client'

import { useState, useTransition } from 'react'
import { CreditCard, Receipt, TriangleAlert } from 'lucide-react'
import { markNotificationRead } from '@/lib/notification-actions'

export type NotificationView = {
  id: string
  type: 'BUDGET_WARN' | 'BUDGET_OVER' | 'PAYMENT_DUE' | 'PAYMENT_OVERDUE' | 'CARD_DUE'
  title: string
  body: string
  timeLabel: string
  read: boolean
}

const ICON = {
  BUDGET_WARN: { Icon: TriangleAlert, cls: 'bg-warning/15 text-warning' },
  BUDGET_OVER: { Icon: TriangleAlert, cls: 'bg-destructive/15 text-destructive' },
  PAYMENT_DUE: { Icon: Receipt, cls: 'bg-destructive/15 text-destructive' },
  PAYMENT_OVERDUE: { Icon: Receipt, cls: 'bg-destructive/15 text-destructive' },
  CARD_DUE: { Icon: CreditCard, cls: 'bg-destructive/15 text-destructive' },
} as const

export function NotificationCard({ n }: { n: NotificationView }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { Icon, cls } = ICON[n.type]
  return (
    <button
      type="button"
      disabled={pending || n.read}
      onClick={() =>
        start(async () => {
          const res = await markNotificationRead(n.id)
          setError(res.ok ? null : res.error)
        })
      }
      className={`flex w-full items-start gap-3 rounded-[16px] border border-border bg-card p-4 text-left shadow-[var(--shadow-card)] ${
        n.read ? 'opacity-60' : 'hover:bg-muted/40'
      }`}
    >
      <span
        data-testid={`icon-${n.id}`}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cls}`}
        aria-hidden
      >
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-foreground">{n.title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{n.body}</span>
        <span className="mt-1.5 block text-[11px] text-muted-foreground/70">{n.timeLabel}</span>
        {error && <span className="mt-1 block text-[11px] font-bold text-destructive">{error}</span>}
      </span>
      {!n.read && (
        <span data-testid={`dot-${n.id}`} className="mt-1 h-2 w-2 shrink-0 rounded-full bg-acc" aria-hidden />
      )}
    </button>
  )
}
