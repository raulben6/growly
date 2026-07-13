'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Money } from '@/components/growly/money'
import { deleteContribution } from '@/lib/goal-actions'

export type ContributionView = {
  id: string
  amount: number
  dateLabel: string // p. ej. "10 jul" (formatShortDateUTC, lo calcula la página)
  note: string | null
}

export function ContributionsListDialog({
  goalName, contributions, trigger,
}: {
  goalName: string
  contributions: ContributionView[]
  trigger: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setError(null)
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="w-full max-w-[400px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">Aportes · {goalName}</DialogTitle>
        {contributions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin aportes todavía.</p>
        ) : (
          <div className="flex max-h-[320px] flex-col divide-y divide-[var(--line)] overflow-y-auto">
            {contributions.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-3">
                <span className="flex-1 text-sm text-muted-foreground">
                  {c.note ? `${c.dateLabel} · ${c.note}` : c.dateLabel}
                </span>
                <Money cents={c.amount} className="text-sm font-extrabold" />
                <button
                  type="button"
                  aria-label="Borrar aporte"
                  title="Borrar aporte"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteContribution(c.id)
                      setError(res.ok ? null : res.error)
                    })
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
