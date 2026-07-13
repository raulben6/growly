export type CalTx = {
  id: string
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  amount: number
  description: string
  date: Date
  status?: 'CLEARED' | 'PENDING'
  categoryName?: string | null
  categoryIcon?: string | null
}

export type CalCard = {
  name: string
  type: string
  archived?: boolean
  statementDay?: number | null
  dueDay?: number | null
}

export type CalendarEvent = {
  kind: 'income' | 'expense' | 'card'
  date: Date
  label: string
  amount?: number // centavos, sin signo; el kind decide el signo en la UI. Tarjeta: sin importe.
  meta: string
  icon: string | null
  pending: boolean
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

// Fechas de datos = fecha-calendario a medianoche UTC → getters UTC (convención unificada).
const inMonthUTC = (d: Date, year: number, month: number) =>
  d.getUTCFullYear() === year && d.getUTCMonth() === month

export function calendarEvents(
  txns: CalTx[],
  accounts: CalCard[],
  year: number,
  month: number,
): Map<number, CalendarEvent[]> {
  const map = new Map<number, CalendarEvent[]>()
  const push = (day: number, e: CalendarEvent) => {
    const list = map.get(day) ?? []
    list.push(e)
    map.set(day, list)
  }

  for (const t of txns) {
    if (!inMonthUTC(t.date, year, month)) continue
    const pending = t.status === 'PENDING'
    const kind = t.type === 'INCOME' ? 'income' : 'expense'
    const meta =
      t.type === 'TRANSFER'
        ? 'Transferencia'
        : pending
          ? t.type === 'INCOME'
            ? 'Ingreso programado'
            : 'Pago programado'
          : (t.categoryName ?? (t.type === 'INCOME' ? 'Ingreso' : 'Gasto'))
    push(t.date.getUTCDate(), {
      kind,
      date: t.date,
      label: t.description,
      amount: t.amount,
      meta,
      icon: t.categoryIcon ?? null,
      pending,
    })
  }

  const dim = daysInMonth(year, month)
  for (const a of accounts) {
    if (a.type !== 'CREDIT_CARD' || a.archived) continue
    if (a.statementDay) {
      const day = Math.min(a.statementDay, dim)
      push(day, {
        kind: 'card',
        date: new Date(Date.UTC(year, month, day)),
        label: `Corte · ${a.name}`,
        meta: 'Corte de tarjeta',
        icon: null,
        pending: false,
      })
    }
    if (a.dueDay) {
      const day = Math.min(a.dueDay, dim)
      push(day, {
        kind: 'card',
        date: new Date(Date.UTC(year, month, day)),
        label: `Pago tarjeta · ${a.name}`,
        meta: 'Pago de tarjeta',
        icon: null,
        pending: false,
      })
    }
  }
  return map
}

// El calendario es planificación: cuenta CLEARED y PENDING (a diferencia de los KPIs del
// dashboard, que solo cuentan CLEARED). TRANSFER no es ingreso ni gasto.
export function calendarMonthTotals(
  txns: CalTx[],
  year: number,
  month: number,
): { income: number; expense: number } {
  let income = 0
  let expense = 0
  for (const t of txns) {
    if (!inMonthUTC(t.date, year, month)) continue
    if (t.type === 'INCOME') income += t.amount
    else if (t.type === 'EXPENSE') expense += t.amount
  }
  return { income, expense }
}

// Prioridad del dot del día: rojo (gasto/pago) > verde (ingreso) > gris (tarjeta).
export function dayDotTone(events: CalendarEvent[]): 'expense' | 'income' | 'card' | null {
  if (events.some((e) => e.kind === 'expense')) return 'expense'
  if (events.some((e) => e.kind === 'income')) return 'income'
  if (events.length > 0) return 'card'
  return null
}

// Rejilla lunes-primero: huecos null antes del día 1 y padding final a múltiplo de 7.
export function monthGridDays(year: number, month: number): (number | null)[] {
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7
  const dim = daysInMonth(year, month)
  const cells: (number | null)[] = Array(offset).fill(null)
  for (let day = 1; day <= dim; day++) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function agendaDayLabel(year: number, month: number, day: number): string {
  const weekday = new Date(Date.UTC(year, month, day)).getUTCDay()
  return `${DIAS[weekday]} · ${day} ${MESES_CORTOS[month].toUpperCase()}`
}

export function shortMonthName(month: number): string {
  return MESES_CORTOS[month]
}
