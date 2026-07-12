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
import { upsertBudget } from '@/lib/budget-actions'
import { parseAmountToCents } from '@/lib/money'

type CategoryOpt = { id: string; name: string }

export type BudgetFormInitial = { categoryId: string; categoryName: string; amountStr: string }

const selectCls = 'h-11 w-full rounded-md border border-input bg-field px-3 text-sm'

export function BudgetDialog({
  year, month, categories, initial, trigger,
}: {
  year: number
  month: number // 0-11
  categories: CategoryOpt[] // opciones seleccionables (EXPENSE sin presupuesto ese mes)
  initial?: BudgetFormInitial // modo edición: categoría fija
  trigger?: React.ReactElement
}) {
  const uid = React.useId()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const editing = !!initial

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
    const categoryId = editing ? initial.categoryId : String(fd.get('categoryId') ?? '')

    const res = await upsertBudget({ categoryId, year, month, amount })
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
            <Button className="h-9 font-extrabold">
              <Plus size={16} /> Añadir categoría
            </Button>
          )
        }
      />
      <DialogContent className="w-full max-w-[420px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">
          {editing ? `Editar límite · ${initial.categoryName}` : 'Añadir categoría'}
        </DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {!editing && (
            <div>
              <Label htmlFor={`${uid}-categoryId`}>Categoría</Label>
              <select id={`${uid}-categoryId`} name="categoryId" required className={selectCls}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor={`${uid}-amount`}>Límite mensual</Label>
            <Input
              id={`${uid}-amount`}
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={initial?.amountStr}
              required
            />
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
