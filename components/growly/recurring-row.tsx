'use client'

import { useState, useTransition } from 'react'
import { Pause, Play, Pencil, Trash2 } from 'lucide-react'
import { CategoryIcon } from '@/components/growly/category-icon'
import { SignedAmount } from '@/components/growly/money'
import { RecurringDialog, type RecurringFormInitial } from '@/components/growly/recurring-dialog'
import { setRecurringRuleActive, deleteRecurringRule } from '@/lib/recurring-actions'

type AccountOpt = { id: string; name: string }
type CategoryOpt = { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }

export type RecurringRuleView = {
  id: string
  description: string
  type: 'INCOME' | 'EXPENSE'
  amount: number
  active: boolean
  freqLabel: string
  nextLabel: string
  accountName: string
  icon: string
  initial: RecurringFormInitial
}

const iconBtnCls =
  'flex h-8 w-8 items-center justify-center rounded-[9px] border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50'

export function RecurringRow({
  rule, accounts, categories,
}: {
  rule: RecurringRuleView
  accounts: AccountOpt[]
  categories: CategoryOpt[]
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const signed = rule.type === 'INCOME' ? rule.amount : -rule.amount

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <CategoryIcon name={rule.icon} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">{rule.description}</span>
          {!rule.active && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
              Pausada
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {rule.freqLabel} · {rule.nextLabel} · {rule.accountName}
        </div>
        {error && <div className="text-[11px] font-bold text-destructive">{error}</div>}
      </div>
      <SignedAmount cents={signed} className="text-[15px] font-extrabold" />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title={rule.active ? 'Pausar' : 'Reanudar'}
          disabled={pending}
          onClick={() => start(async () => {
            const res = await setRecurringRuleActive(rule.id, !rule.active)
            setError(res.ok ? null : res.error)
          })}
          className={iconBtnCls}
        >
          {rule.active ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <RecurringDialog
          accounts={accounts}
          categories={categories}
          ruleId={rule.id}
          initial={rule.initial}
          trigger={
            <button type="button" title="Editar" className={iconBtnCls}>
              <Pencil size={15} />
            </button>
          }
        />
        <button
          type="button"
          title="Borrar"
          disabled={pending}
          onClick={() => start(async () => {
            const res = await deleteRecurringRule(rule.id)
            setError(res.ok ? null : res.error)
          })}
          className={iconBtnCls}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
