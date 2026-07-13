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
import { createGoal, updateGoal } from '@/lib/goal-actions'
import { parseAmountToCents } from '@/lib/money'

const EMOJIS = ['✈️', '🛡️', '💻', '🏠', '🚗', '🎁', '💍', '🎓']
const PALETTE = ['#10B981', '#3B82F6', '#8B7CF6', '#E0AD2E', '#C9584F', '#8A857E']

export type GoalFormInitial = {
  name: string
  emoji: string // '' = sin emoji
  colorHex: string
  targetAmountStr: string
  targetDate: string // 'YYYY-MM-DD' o ''
}

export function GoalDialog({
  goalId, initial, trigger,
}: {
  goalId?: string
  initial?: GoalFormInitial
  trigger?: React.ReactElement
}) {
  const uid = React.useId()
  const [open, setOpen] = useState(false)
  const [emoji, setEmoji] = useState(initial?.emoji ?? '')
  const [colorHex, setColorHex] = useState(initial?.colorHex ?? PALETTE[0])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const editing = !!goalId

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const targetAmount = parseAmountToCents(String(fd.get('targetAmount') ?? ''))
    if (!targetAmount) {
      setError('Importe no válido')
      setLoading(false)
      return
    }
    const payload = {
      name: String(fd.get('name') ?? ''),
      emoji: emoji.trim() || null,
      colorHex,
      targetAmount,
      targetDate: String(fd.get('targetDate') ?? '') || null,
    }
    const res = editing ? await updateGoal(goalId, payload) : await createGoal(payload)
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
        if (o) {
          // resincronizar al abrir (lección C1): el initial puede haber cambiado tras un revalidate
          setEmoji(initial?.emoji ?? '')
          setColorHex(initial?.colorHex ?? PALETTE[0])
        }
        if (!o) setError(null)
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <button
              type="button"
              className="flex min-h-[120px] w-full items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-border bg-card/50 text-sm font-bold text-muted-foreground hover:bg-muted"
            >
              <Plus size={16} /> Nueva meta
            </button>
          )
        }
      />
      <DialogContent className="w-full max-w-[440px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">
          {editing ? `Editar meta · ${initial?.name ?? ''}` : 'Nueva meta'}
        </DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor={`${uid}-name`}>Nombre</Label>
            <Input id={`${uid}-name`} name="name" defaultValue={initial?.name} required />
          </div>
          <div>
            <Label htmlFor={`${uid}-emoji`}>Emoji</Label>
            <Input
              id={`${uid}-emoji`}
              name="emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="✈️"
              className="w-24"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  aria-pressed={emoji === em}
                  onClick={() => setEmoji(em)}
                  className={`flex h-9 w-9 items-center justify-center rounded-[9px] border text-lg ${
                    emoji === em ? 'border-acc bg-acc/10' : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Color</Label>
            <div className="mt-1 flex gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={colorHex === c}
                  onClick={() => setColorHex(c)}
                  className={`h-8 w-8 rounded-full border-2 ${
                    colorHex === c ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor={`${uid}-targetAmount`}>Importe objetivo</Label>
            <Input
              id={`${uid}-targetAmount`}
              name="targetAmount"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={initial?.targetAmountStr}
              required
            />
          </div>
          <div>
            <Label htmlFor={`${uid}-targetDate`}>Fecha objetivo</Label>
            <Input
              id={`${uid}-targetDate`}
              name="targetDate"
              type="date"
              defaultValue={initial?.targetDate}
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
