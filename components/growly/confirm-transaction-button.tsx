'use client'

import { useTransition } from 'react'
import { confirmTransaction } from '@/lib/recurring-actions'

export function ConfirmTransactionButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await confirmTransaction(id) })}
      className="rounded-[9px] border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
    >
      {pending ? '…' : 'Confirmar'}
    </button>
  )
}
