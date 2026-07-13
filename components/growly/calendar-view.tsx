'use client'

import { useState } from 'react'
import { CreditCard } from 'lucide-react'
import { Money, SignedAmount } from '@/components/growly/money'
import { CategoryIcon } from '@/components/growly/category-icon'
import { MonthNav } from '@/components/growly/month-nav'
import { agendaDayLabel, dayDotTone, type CalendarEvent } from '@/lib/calendar'
import type { YearMonth } from '@/lib/month-param'

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const DOT = {
  expense: 'bg-destructive',
  income: 'bg-acc',
  card: 'bg-muted-foreground/60',
} as const

export function CalendarView({
  ym, todayDay, cells, eventsByDay, totals, monthShort,
}: {
  ym: YearMonth
  todayDay: number | null // día de hoy si el mes visto es el actual
  cells: (number | null)[]
  eventsByDay: [number, CalendarEvent[]][]
  totals: { income: number; expense: number }
  monthShort: string // 'jul'
}) {
  const events = new Map(eventsByDay)
  const [selected, setSelected] = useState(todayDay ?? 1)
  const selectedEvents = events.get(selected) ?? []

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Panel calendario */}
      <div className="rounded-[22px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-acc/15 px-3 py-1 text-xs font-extrabold text-acc">
            Ingresos {monthShort} +<Money cents={totals.income} withCents={false} />
          </span>
          <span className="rounded-full bg-destructive/15 px-3 py-1 text-xs font-extrabold text-destructive">
            Pagos {monthShort} −<Money cents={totals.expense} withCents={false} />
          </span>
        </div>
        <div className="mb-3 flex justify-center">
          <MonthNav ym={ym} basePath="/calendario" />
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-bold text-muted-foreground">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />
            const tone = dayDotTone(events.get(day) ?? [])
            const isToday = day === todayDay
            const isSelected = day === selected
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelected(day)}
                aria-label={`Día ${day}`}
                aria-pressed={isSelected}
                className="flex flex-col items-center gap-0.5 py-1.5"
              >
                <span
                  data-testid={isToday ? 'calendar-today' : undefined}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    isToday
                      ? 'bg-acc text-white'
                      : isSelected
                        ? 'bg-forest text-white'
                        : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {day}
                </span>
                <span
                  data-testid={tone ? `dot-${day}` : undefined}
                  className={`h-1.5 w-1.5 rounded-full ${tone ? DOT[tone] : 'bg-transparent'}`}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* Agenda del día seleccionado */}
      <div className="rounded-[22px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
        <div className="mb-3 text-xs font-extrabold tracking-wide text-muted-foreground">
          {agendaDayLabel(ym.year, ym.month, selected)}
        </div>
        {selectedEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin eventos este día.</p>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--line)]">
            {selectedEvents.map((e, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  {e.kind === 'card' ? <CreditCard size={18} /> : <CategoryIcon name={e.icon ?? 'ellipsis'} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-foreground">{e.label}</div>
                  <div className={`text-xs ${e.pending ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
                    {e.meta}
                  </div>
                </div>
                {e.amount !== undefined && (
                  <SignedAmount
                    cents={e.kind === 'income' ? e.amount : -e.amount}
                    className="text-sm font-extrabold"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
