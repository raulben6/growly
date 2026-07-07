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
import { createTransaction } from '@/lib/transaction-actions'
import { parseAmountToCents } from '@/lib/money'

type AccountOpt = { id: string; name: string }
type CategoryOpt = { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }
type TxType = 'EXPENSE' | 'INCOME' | 'TRANSFER'

const SEG: { value: TxType; label: string }[] = [
  { value: 'EXPENSE', label: 'Gasto' },
  { value: 'INCOME', label: 'Ingreso' },
  { value: 'TRANSFER', label: 'Transferencia' },
]

const selectCls =
  'h-11 w-full rounded-md border border-input bg-field px-3 text-sm'

export function TransactionDialog({
  accounts,
  categories,
}: {
  accounts: AccountOpt[]
  categories: CategoryOpt[]
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<TxType>('EXPENSE')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset() {
    setType('EXPENSE')
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
      date: String(fd.get('date') ?? ''),
      currency: 'USD',
      accountId: String(fd.get('accountId') ?? ''),
      categoryId:
        type === 'TRANSFER' ? null : String(fd.get('categoryId') ?? '') || null,
      transferAccountId:
        type === 'TRANSFER' ? String(fd.get('transferAccountId') ?? '') : null,
    }

    const res = await createTransaction(payload)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setOpen(false)
    reset()
  }

  const cats = categories.filter(
    (c) => c.kind === (type === 'INCOME' ? 'INCOME' : 'EXPENSE'),
  )

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
          <Button className="h-11 font-extrabold">
            <Plus size={18} /> Añadir movimiento
          </Button>
        }
      />
      <DialogContent className="w-full max-w-[440px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">
          Nuevo movimiento
        </DialogTitle>

        <div className="mb-4 flex gap-1 rounded-xl bg-muted p-1">
          {SEG.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setType(s.value)}
              className={`flex-1 rounded-lg py-2 text-sm font-bold ${
                type === s.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="amount">Importe</Label>
            <Input
              id="amount"
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </div>
          <div>
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" name="description" required />
          </div>

          {type !== 'TRANSFER' ? (
            <>
              <div>
                <Label htmlFor="categoryId">Categoría</Label>
                <select id="categoryId" name="categoryId" className={selectCls}>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="accountId">Cuenta</Label>
                <select id="accountId" name="accountId" className={selectCls}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="accountId">Cuenta origen</Label>
                <select id="accountId" name="accountId" className={selectCls}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="transferAccountId">Cuenta destino</Label>
                <select
                  id="transferAccountId"
                  name="transferAccountId"
                  defaultValue={accounts[1]?.id ?? accounts[0]?.id}
                  className={selectCls}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="date">Fecha</Label>
            <Input id="date" name="date" type="date" required />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={loading}
            className="mt-2 h-11 font-extrabold"
          >
            Guardar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
