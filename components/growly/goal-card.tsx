'use client'

import { useState, useTransition } from 'react'
import { Archive, List, Pencil } from 'lucide-react'
import { Money } from '@/components/growly/money'
import { GoalDialog, type GoalFormInitial } from '@/components/growly/goal-dialog'
import { ContributionDialog } from '@/components/growly/contribution-dialog'
import {
  ContributionsListDialog,
  type ContributionView,
} from '@/components/growly/contributions-list-dialog'
import { archiveGoal } from '@/lib/goal-actions'

export type GoalView = {
  id: string
  name: string
  emoji: string | null
  colorHex: string
  targetAmount: number
  saved: number
  pct: number
  barPct: number
  completed: boolean
  dateLabel: string
  initial: GoalFormInitial
  contributions: ContributionView[]
}

const COMPLETED_GREEN = '#10B981'

const iconBtnCls =
  'flex h-8 w-8 items-center justify-center rounded-[9px] border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50'

export function GoalCard({ goal }: { goal: GoalView }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="rounded-[22px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        {/* tile 42px con el emoji sobre el color de la meta al ~13% (alfa hex 21) */}
        <div
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ backgroundColor: `${goal.colorHex}21` }}
          aria-hidden
        >
          {goal.emoji ?? '🎯'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-foreground">{goal.name}</span>
            {goal.completed && (
              <span className="rounded-full bg-acc/15 px-2 py-0.5 text-[11px] font-bold text-acc">
                ¡Completada!
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{goal.dateLabel}</div>
        </div>
        <div className="text-right">
          <Money cents={goal.saved} withCents={false} className="text-xl font-extrabold text-foreground" />
          <div className="text-xs text-muted-foreground">
            de <Money cents={goal.targetAmount} withCents={false} />
          </div>
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-muted">
        <div
          data-testid="goal-bar"
          className="h-2 rounded-full"
          style={{
            width: `${goal.barPct}%`,
            backgroundColor: goal.completed ? COMPLETED_GREEN : goal.colorHex,
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">{goal.pct}% completado</span>
        <div className="flex items-center gap-1.5">
          <ContributionDialog goalId={goal.id} goalName={goal.name} />
          <ContributionsListDialog
            goalName={goal.name}
            contributions={goal.contributions}
            trigger={
              <button type="button" aria-label="Ver aportes" title="Ver aportes" className={iconBtnCls}>
                <List size={15} />
              </button>
            }
          />
          <GoalDialog
            goalId={goal.id}
            initial={goal.initial}
            trigger={
              <button type="button" aria-label="Editar" title="Editar" className={iconBtnCls}>
                <Pencil size={15} />
              </button>
            }
          />
          <button
            type="button"
            aria-label="Archivar"
            title="Archivar"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await archiveGoal(goal.id)
                setError(res.ok ? null : res.error)
              })
            }
            className={iconBtnCls}
          >
            <Archive size={15} />
          </button>
        </div>
      </div>
      {error && <div className="mt-1 text-[11px] font-bold text-destructive">{error}</div>}
    </div>
  )
}
