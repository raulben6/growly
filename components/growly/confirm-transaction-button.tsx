'use client'

import { useState, useTransition } from 'react'
import { confirmTransaction } from '@/lib/recurring-actions'

export function ConfirmTransactionButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-[11px] font-bold text-destructive">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => {
          const res = await confirmTransaction(id)
          setError(res.ok ? null : res.error)
        })}
        className="rounded-[9px] border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
      >
        {pending ? '…' : 'Confirmar'}
      </button>
    </span>
  )
}
