'use client'

import { useState, useTransition } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Money } from '@/components/growly/money'
import { BudgetDialog } from '@/components/growly/budget-dialog'
import { deleteBudget } from '@/lib/budget-actions'

// Rojo de excedido del diseño (Growly Web): monto y barra en #C9584F, barra al 100%.
const OVER = '#C9584F'

export type BudgetRowView = {
  budgetId: string
  categoryId: string
  name: string
  colorHex: string
  limit: number
  spent: number
  pct: number
  over: boolean
}

const iconBtnCls =
  'flex h-8 w-8 items-center justify-center rounded-[9px] border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50'

export function BudgetCategoryRow({
  row, year, month,
}: {
  row: BudgetRowView
  year: number
  month: number // 0-11
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const barPct = Math.min(row.pct, 100)

  return (
    <div className="py-4">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.colorHex }} />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{row.name}</span>
        <span className="text-sm font-extrabold text-foreground" style={row.over ? { color: OVER } : undefined}>
          <Money cents={row.spent} />{' '}
          <span className="font-bold text-muted-foreground">
            / <Money cents={row.limit} withCents={false} />
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          <BudgetDialog
            year={year}
            month={month}
            categories={[]}
            initial={{
              categoryId: row.categoryId,
              categoryName: row.name,
              amountStr: (row.limit / 100).toFixed(2),
            }}
            trigger={
              <button type="button" title="Editar límite" className={iconBtnCls}>
                <Pencil size={15} />
              </button>
            }
          />
          <button
            type="button"
            title="Quitar del presupuesto"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await deleteBudget(row.budgetId)
                setError(res.ok ? null : res.error)
              })
            }
            className={iconBtnCls}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted">
        <div
          data-testid="budget-row-bar"
          className="h-2 rounded-full"
          style={{ width: `${barPct}%`, backgroundColor: row.over ? OVER : row.colorHex }}
        />
      </div>
      {error && <div className="mt-1 text-[11px] font-bold text-destructive">{error}</div>}
    </div>
  )
}
