'use client'

import * as React from 'react'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addContribution } from '@/lib/goal-actions'
import { parseAmountToCents } from '@/lib/money'

// fecha local de hoy en formato del input date
function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function ContributionDialog({
  goalId, goalName, trigger,
}: {
  goalId: string
  goalName: string
  trigger?: React.ReactElement
}) {
  const uid = React.useId()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const amount = parseAmountToCents(String(fd.get('amount') ?? ''))
    if (!amount) {
      setError('Importe no válido')
      setLoading(false)
      return
    }
    const res = await addContribution({
      goalId,
      amount,
      date: String(fd.get('date') ?? '') || undefined,
      note: String(fd.get('note') ?? '').trim() || undefined,
    })
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setError(null)
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button className="h-8 px-3 text-xs font-extrabold">
              <Plus size={14} /> Aportar
            </Button>
          )
        }
      />
      <DialogContent className="w-full max-w-[400px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">Aportar a {goalName}</DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor={`${uid}-amount`}>Importe</Label>
            <Input id={`${uid}-amount`} name="amount" inputMode="decimal" placeholder="0.00" required />
          </div>
          <div>
            <Label htmlFor={`${uid}-date`}>Fecha</Label>
            <Input id={`${uid}-date`} name="date" type="date" defaultValue={todayStr()} required />
          </div>
          <div>
            <Label htmlFor={`${uid}-note`}>Nota (opcional)</Label>
            <Input id={`${uid}-note`} name="note" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-2 h-11 font-extrabold">
            Guardar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
