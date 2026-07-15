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
import { createAccount } from '@/lib/account-actions'
import { parseAmountToCents } from '@/lib/money'

const TYPES = [
  { value: 'CHECKING', label: 'Cuenta corriente' },
  { value: 'SAVINGS', label: 'Ahorros' },
  { value: 'CASH', label: 'Efectivo' },
  { value: 'CREDIT_CARD', label: 'Tarjeta de crédito' },
] as const

type AccountType = (typeof TYPES)[number]['value']

export function AccountDialog() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<AccountType>('CHECKING')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    const initialBalance =
      parseAmountToCents(String(fd.get('initialBalance') ?? '')) ?? 0
    const limitRaw = fd.get('creditLimit')
    const creditLimit =
      type === 'CREDIT_CARD' && limitRaw
        ? parseAmountToCents(String(limitRaw))
        : null
    // día del mes 1-31, o null; el schema lo valida y el calendario/alertas lo usan
    const dayOrNull = (v: FormDataEntryValue | null) => {
      const n = Number(String(v ?? '').trim())
      return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
    }
    const statementDay = type === 'CREDIT_CARD' ? dayOrNull(fd.get('statementDay')) : null
    const dueDay = type === 'CREDIT_CARD' ? dayOrNull(fd.get('dueDay')) : null

    const res = await createAccount({
      name: String(fd.get('name') ?? ''),
      bankName: String(fd.get('bankName') ?? ''),
      type,
      currency: 'USD',
      colorHex: '#10B981',
      initialBalance,
      creditLimit,
      statementDay,
      dueDay,
    })

    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setOpen(false)
    setType('CHECKING')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="h-11 font-extrabold">
            <Plus size={18} /> Añadir cuenta
          </Button>
        }
      />
      <DialogContent className="w-full max-w-[420px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">
          Nueva cuenta
        </DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="bankName">Banco</Label>
            <Input id="bankName" name="bankName" />
          </div>
          <div>
            <Label htmlFor="type">Tipo</Label>
            <select
              id="type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              className="h-11 w-full rounded-md border border-input bg-field px-3 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="initialBalance">Saldo inicial</Label>
            <Input
              id="initialBalance"
              name="initialBalance"
              inputMode="decimal"
              placeholder="0.00"
            />
          </div>
          {type === 'CREDIT_CARD' && (
            <>
              <div>
                <Label htmlFor="creditLimit">Límite de crédito</Label>
                <Input
                  id="creditLimit"
                  name="creditLimit"
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="statementDay">Día de corte</Label>
                  <Input
                    id="statementDay"
                    name="statementDay"
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    placeholder="1-31"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="dueDay">Día de vencimiento</Label>
                  <Input
                    id="dueDay"
                    name="dueDay"
                    type="number"
                    min={1}
                    max={31}
                    inputMode="numeric"
                    placeholder="1-31"
                  />
                </div>
              </div>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={loading}
            className="mt-2 h-11 font-extrabold"
          >
            Crear cuenta
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
