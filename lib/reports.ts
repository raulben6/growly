import { prevMonth, type YearMonth } from '@/lib/month-param'
import { daysInMonth } from '@/lib/calendar'

export type ReportTx = {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  amount: number
  date: Date
  status?: 'CLEARED' | 'PENDING'
  categoryId?: string | null
}

export type MonthPoint = { year: number; month: number; income: number; expense: number }

const isCleared = (t: { status?: string }) => t.status !== 'PENDING'

// Serie mensual de ingresos/gastos CLEARED de los últimos `months` meses terminando en el
// actual. Fechas de datos con getters UTC; el mes actual sale de los componentes locales
// de now (convención unificada C4). TRANSFER no es ingreso ni gasto.
export function monthlySeries(txns: ReportTx[], now: Date, months: number): MonthPoint[] {
  const window: YearMonth[] = []
  let ym: YearMonth = { year: now.getFullYear(), month: now.getMonth() }
  for (let i = 0; i < months; i++) {
    window.unshift(ym)
    ym = prevMonth(ym)
  }
  const points: MonthPoint[] = window.map(({ year, month }) => ({ year, month, income: 0, expense: 0 }))
  const index = new Map(points.map((p, i) => [`${p.year}-${p.month}`, i]))
  for (const t of txns) {
    if (!isCleared(t) || t.type === 'TRANSFER') continue
    const i = index.get(`${t.date.getUTCFullYear()}-${t.date.getUTCMonth()}`)
    if (i === undefined) continue
    if (t.type === 'INCOME') points[i].income += t.amount
    else points[i].expense += t.amount
  }
  return points
}

const rateOf = (p: MonthPoint) =>
  p.income > 0 ? Math.round(((p.income - p.expense) / p.income) * 100) : 0
const isEmptyMonth = (p: MonthPoint) => p.income === 0 && p.expense === 0

// KPIs del mes actual (último punto de la serie) con deltas vs el anterior.
// El gasto medio/día del mes en curso divide entre los días TRANSCURRIDOS (now.getDate());
// el del mes anterior, entre sus días totales. Deltas null si el mes anterior está vacío.
export function reportKpis(series: MonthPoint[], now: Date) {
  const cur = series[series.length - 1]
  const prev = series.length > 1 ? series[series.length - 2] : undefined
  const savingsRate = rateOf(cur)
  const avgDailyExpense = Math.round(cur.expense / now.getDate())
  let savingsRateDelta: number | null = null
  let avgDailyExpenseDelta: number | null = null
  if (prev && !isEmptyMonth(prev)) {
    savingsRateDelta = savingsRate - rateOf(prev)
    avgDailyExpenseDelta =
      avgDailyExpense - Math.round(prev.expense / daysInMonth(prev.year, prev.month))
  }
  return { savingsRate, savingsRateDelta, avgDailyExpense, avgDailyExpenseDelta }
}

// Variación % del mes actual vs el anterior para los KPI del dashboard (null si el previo es 0).
export function kpiDeltas(series: MonthPoint[]): { incomePct: number | null; expensePct: number | null } {
  const cur = series[series.length - 1]
  const prev = series.length > 1 ? series[series.length - 2] : undefined
  const pct = (c: number, p: number) => (p > 0 ? Math.round(((c - p) / p) * 100) : null)
  return {
    incomePct: prev ? pct(cur.income, prev.income) : null,
    expensePct: prev ? pct(cur.expense, prev.expense) : null,
  }
}

export type RangeCategoryTotal = { id: string; name: string; colorHex: string; total: number }

// Top categorías de gasto CLEARED del rango [fromYm..toYm] inclusive (mes 0-11, getters UTC).
export function categoryTotalsForRange(
  txns: ReportTx[],
  categories: { id: string; name: string; colorHex: string }[],
  fromYm: YearMonth,
  toYm: YearMonth,
): RangeCategoryTotal[] {
  const idx = ({ year, month }: YearMonth) => year * 12 + month
  const from = idx(fromYm)
  const to = idx(toYm)
  const catById = new Map(categories.map((c) => [c.id, c]))
  const totals = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'EXPENSE' || !isCleared(t)) continue
    const i = t.date.getUTCFullYear() * 12 + t.date.getUTCMonth()
    if (i < from || i > to) continue
    const key = t.categoryId ?? 'none'
    totals.set(key, (totals.get(key) ?? 0) + t.amount)
  }
  return [...totals.entries()]
    .map(([id, total]) => {
      const c = id === 'none' ? undefined : catById.get(id)
      return { id, name: c?.name ?? 'Otros', colorHex: c?.colorHex ?? '#8A857E', total }
    })
    .sort((a, b) => b.total - a.total)
}

// Puntos "x,y x,y …" para una polyline SVG: escala values a [0..max] en width×height
// con margen superior del 10% (y crece hacia abajo). '' si no hay valores o max <= 0.
export function linePoints(values: number[], width: number, height: number, max: number): string {
  if (values.length === 0 || max <= 0) return ''
  const step = values.length > 1 ? width / (values.length - 1) : 0
  return values
    .map((v, i) => `${Math.round(i * step)},${Math.round(height - (v / max) * height * 0.9)}`)
    .join(' ')
}
