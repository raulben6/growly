'use client'

import * as React from 'react'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createRecurringRule, updateRecurringRule } from '@/lib/recurring-actions'
import { parseAmountToCents } from '@/lib/money'

type AccountOpt = { id: string; name: string }
type CategoryOpt = { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }
type RuleType = 'EXPENSE' | 'INCOME'

export type RecurringFormInitial = {
  type: RuleType
  amountStr: string
  description: string
  accountId: string
  categoryId: string
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY'
  startDate: string // YYYY-MM-DD
  endDate: string // '' si no hay
}

const SEG: { value: RuleType; label: string }[] = [
  { value: 'EXPENSE', label: 'Gasto' },
  { value: 'INCOME', label: 'Ingreso' },
]

const FRECUENCIAS = [
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'BIWEEKLY', label: 'Quincenal' },
  { value: 'MONTHLY', label: 'Mensual' },
  { value: 'YEARLY', label: 'Anual' },
]

const selectCls = 'h-11 w-full rounded-md border border-input bg-field px-3 text-sm'

export function RecurringDialog({
  accounts, categories, ruleId, initial, trigger,
}: {
  accounts: AccountOpt[]
  categories: CategoryOpt[]
  ruleId?: string
  initial?: RecurringFormInitial
  trigger?: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<RuleType>(initial?.type ?? 'EXPENSE')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset() {
    setType(initial?.type ?? 'EXPENSE')
    setError(null)
  }

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

    const payload = {
      type,
      amount,
      description: String(fd.get('description') ?? ''),
      accountId: String(fd.get('accountId') ?? ''),
      categoryId: String(fd.get('categoryId') ?? '') || null,
      frequency: String(fd.get('frequency') ?? 'MONTHLY'),
      startDate: String(fd.get('startDate') ?? ''),
      endDate: String(fd.get('endDate') ?? '') || null,
    }

    const res = ruleId
      ? await updateRecurringRule(ruleId, payload)
      : await createRecurringRule(payload)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setOpen(false)
    reset()
  }

  const cats = categories.filter((c) => c.kind === type)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button className="h-11 font-extrabold">
              <Plus size={18} /> Nueva recurrencia
            </Button>
          )
        }
      />
      <DialogContent className="w-full max-w-[440px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">
          {ruleId ? 'Editar recurrencia' : 'Nueva recurrencia'}
        </DialogTitle>

        <div className="mb-4 flex gap-1 rounded-xl bg-muted p-1">
          {SEG.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setType(s.value)}
              className={`flex-1 rounded-lg py-2 text-sm font-bold ${
                type === s.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="rec-amount">Importe</Label>
            <Input id="rec-amount" name="amount" inputMode="decimal" placeholder="0.00"
              defaultValue={initial?.amountStr} required />
          </div>
          <div>
            <Label htmlFor="rec-description">Descripción</Label>
            <Input id="rec-description" name="description" defaultValue={initial?.description} required />
          </div>
          <div>
            <Label htmlFor="rec-categoryId">Categoría</Label>
            <select id="rec-categoryId" name="categoryId" className={selectCls}
              defaultValue={initial?.categoryId}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="rec-accountId">Cuenta</Label>
            <select id="rec-accountId" name="accountId" className={selectCls}
              defaultValue={initial?.accountId}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="rec-frequency">Frecuencia</Label>
            <select id="rec-frequency" name="frequency" className={selectCls}
              defaultValue={initial?.frequency ?? 'MONTHLY'}>
              {FRECUENCIAS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="rec-startDate">Primera fecha</Label>
            <Input id="rec-startDate" name="startDate" type="date"
              defaultValue={initial?.startDate ?? today} required />
          </div>
          <div>
            <Label htmlFor="rec-endDate">Fecha fin (opcional)</Label>
            <Input id="rec-endDate" name="endDate" type="date" defaultValue={initial?.endDate} />
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
