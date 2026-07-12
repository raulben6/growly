import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { monthLabel, monthParam, prevMonth, nextMonth, type YearMonth } from '@/lib/month-param'

const btnCls =
  'flex h-9 w-9 items-center justify-center rounded-[11px] border border-border bg-card text-muted-foreground hover:bg-muted'

export function MonthNav({ ym, basePath }: { ym: YearMonth; basePath: string }) {
  return (
    <div className="flex items-center gap-2">
      <Link aria-label="Mes anterior" href={`${basePath}?m=${monthParam(prevMonth(ym))}`} className={btnCls}>
        <ChevronLeft size={16} />
      </Link>
      <span className="min-w-[130px] text-center text-sm font-extrabold text-foreground">
        {monthLabel(ym)}
      </span>
      <Link aria-label="Mes siguiente" href={`${basePath}?m=${monthParam(nextMonth(ym))}`} className={btnCls}>
        <ChevronRight size={16} />
      </Link>
    </div>
  )
}
