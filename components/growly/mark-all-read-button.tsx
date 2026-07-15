'use client'

import { useState, useTransition } from 'react'
import { markAllNotificationsRead } from '@/lib/notification-actions'

export function MarkAllReadButton() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs font-bold text-destructive">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await markAllNotificationsRead()
            setError(res.ok ? null : res.error)
          })
        }
        className="rounded-[11px] border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        Marcar todas como leídas
      </button>
    </div>
  )
}
