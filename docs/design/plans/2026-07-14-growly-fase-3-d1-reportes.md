# Growly Fase 3 · D1: Reportes · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/reportes` real (barras Ingresos vs Gastos por mes con toggle 6 meses/Año, tasa de ahorro y gasto medio/día con deltas vs mes anterior, top categorías del periodo) y dashboard completo del diseño web (chart "Flujo de caja", donut recolocado, deltas "▲ 8% vs jun" en KPIs, Recientes a ancho completo).

**Architecture:** `lib/reports.ts` puro calcula la serie mensual (`monthlySeries`), los KPIs con deltas (`reportKpis`, `kpiDeltas`), los totales por categoría de un rango (`categoryTotalsForRange`) y los puntos de polyline (`linePoints`). Los charts son SVG/CSS propio en componentes server-safe (`BarsChart`, `CashflowChart`, `CategoryBars`, `ReportStat`); `KpiCard` gana una prop `delta` opcional. Sin migraciones, sin dependencias nuevas.

**Tech Stack:** Next.js 16 App Router (Server Components), Vitest + RTL, Playwright. Sin librerías de charts.

**Spec:** `docs/superpowers/specs/2026-07-14-growly-fase-3-design.md` (secciones 2, 3, 6, 7, 8, sub-plan D1).

**Rama:** `feature/fase-3-d1` desde `master`. Merge a `master` tras el review final de rama (patrón C1-C4).

## Global Constraints

- **Convención de fechas unificada (C4):** fechas de datos = fecha-calendario a medianoche UTC → getters UTC (`getUTCFullYear`/`getUTCMonth`); "mes actual" y "días transcurridos" desde componentes LOCALES de `now`. Ninguna función nueva usa getters locales sobre fechas de datos.
- **Dinero:** centavos `Int`; formateo con `formatMoney`/`<Money>`. Serie y KPIs solo cuentan **CLEARED** (consistente con los KPIs existentes); TRANSFER no es ingreso ni gasto.
- **Charts SVG/CSS propio**: cero dependencias, render en servidor, tokens del design system (`bg-acc`, `bg-destructive`, `var(--line)`) sobre superficies claras; hex fijos solo en superficies forest (aquí no hay).
- **Deltas:** verde cuando la dirección es buena (ingresos ↑, gastos/gasto medio ↓, tasa de ahorro ↑); rojo en caso contrario; sin delta (null) cuando el mes anterior no tiene datos comparables.
- **Multi-tenant:** `userId` solo de `auth()`; sin sesión → `redirect('/login')`.
- **Next.js 16:** `searchParams` es `Promise` (await). Reutilizar helpers existentes: `prevMonth`/`YearMonth` de `lib/month-param`, `daysInMonth`/`shortMonthName` de `lib/calendar`.
- **UI en español**, tokens y radios de la casa (`rounded-[11px]`/`[18px]`/`[20px]`/`[22px]`, `shadow-[var(--shadow-card)]`); tabs como las de /movimientos (`bg-forest text-white` activa).
- **Tests con fecha:** reloj fijado `vi.useFakeTimers({ toFake: ['Date'] })` donde "hoy" importe. Tests de datos con fechas `Date.UTC` (portables entre offsets).
- **Prisma pinned 6.19.3**; `.env` local/gitignored, no tocar. Lint baseline conocido: 1 error pre-existente en `components/growly/category-donut.tsx`.
- **Tests de DB:** `describe.skipIf(!process.env.DATABASE_URL)`; timeouts Neon → `--testTimeout=20000` y anotarlo.
- Commits `feat:`/`test:`/`fix:` en español.

---

### Task 1: `lib/reports.ts` puro, serie mensual, KPIs, rango de categorías y polyline

**Files:**
- Create: `lib/reports.ts`
- Test: `tests/reports.test.ts`

**Interfaces:**
- Consumes: `prevMonth`, `type YearMonth` de `@/lib/month-param`; `daysInMonth` de `@/lib/calendar`.
- Produces (Tasks 2-4 dependen de estos nombres exactos):
  - `type ReportTx = { type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amount: number; date: Date; status?: 'CLEARED' | 'PENDING'; categoryId?: string | null }`
  - `type MonthPoint = { year: number; month: number; income: number; expense: number }`
  - `monthlySeries(txns: ReportTx[], now: Date, months: number): MonthPoint[]`: últimos `months` meses terminando en el actual, orden cronológico, meses vacíos en 0.
  - `reportKpis(series: MonthPoint[], now: Date): { savingsRate: number; savingsRateDelta: number | null; avgDailyExpense: number; avgDailyExpenseDelta: number | null }`: tasa del mes actual (income>0 ? round((inc−exp)/inc·100): 0) y delta en puntos; gasto medio/día actual = expense/`now.getDate()`, el del mes anterior usa sus días totales; deltas null si el mes anterior está vacío (income y expense 0).
  - `kpiDeltas(series: MonthPoint[]): { incomePct: number | null; expensePct: number | null }`: variación % vs mes anterior; null si el valor previo es 0.
  - `type RangeCategoryTotal = { id: string; name: string; colorHex: string; total: number }`
  - `categoryTotalsForRange(txns, categories, fromYm: YearMonth, toYm: YearMonth): RangeCategoryTotal[]`: EXPENSE CLEARED del rango inclusive, orden desc, `'Otros'`/`#8A857E` para sin categoría.
  - `linePoints(values: number[], width: number, height: number, max: number): string`: `"x,y x,y …"` con margen superior del 10% (y crece hacia abajo); `''` si no hay valores o max ≤ 0.

- [ ] **Step 1: Escribir los tests**

Crear `tests/reports.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  monthlySeries, reportKpis, kpiDeltas, categoryTotalsForRange, linePoints,
  type ReportTx, type MonthPoint,
} from '@/lib/reports'

const tx = (over: Partial<ReportTx>): ReportTx => ({
  type: 'EXPENSE', amount: 10_000, date: new Date(Date.UTC(2026, 6, 10)),
  status: 'CLEARED', categoryId: 'c1', ...over,
})

describe('monthlySeries', () => {
  it('ventana de 6 meses cruzando el año, meses vacíos en 0', () => {
    // "hoy" = 15 feb 2027 → ventana sep 2026..feb 2027
    const series = monthlySeries(
      [
        tx({ type: 'INCOME', amount: 100_000, date: new Date(Date.UTC(2026, 8, 5)) }),
        tx({ amount: 40_000, date: new Date(Date.UTC(2027, 1, 1)) }), // día 1 UTC → feb
        tx({ amount: 99_000, date: new Date(Date.UTC(2026, 7, 30)) }), // ago: fuera
      ],
      new Date(2027, 1, 15), 6,
    )
    expect(series.map((p) => [p.year, p.month])).toEqual([
      [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2027, 0], [2027, 1],
    ])
    expect(series[0]).toMatchObject({ income: 100_000, expense: 0 })
    expect(series[5]).toMatchObject({ income: 0, expense: 40_000 })
    expect(series[2]).toMatchObject({ income: 0, expense: 0 })
  })

  it('ignora PENDING y TRANSFER', () => {
    const series = monthlySeries(
      [
        tx({ status: 'PENDING', amount: 50_000 }),
        tx({ type: 'TRANSFER', amount: 70_000 }),
        tx({ amount: 30_000 }),
      ],
      new Date(2026, 6, 15), 6,
    )
    expect(series[5]).toMatchObject({ income: 0, expense: 30_000 })
  })
})

describe('reportKpis', () => {
  it('tasa y gasto medio/día con deltas vs mes anterior', () => {
    const series: MonthPoint[] = [
      { year: 2026, month: 5, income: 300_000, expense: 189_000 }, // jun: tasa 37, media 6300 (30 días)
      { year: 2026, month: 6, income: 300_000, expense: 90_000 },  // jul: tasa 70, media 7500 (día 12)
    ]
    expect(reportKpis(series, new Date(2026, 6, 12))).toEqual({
      savingsRate: 70,
      savingsRateDelta: 33,
      avgDailyExpense: 7_500,
      avgDailyExpenseDelta: 1_200,
    })
  })

  it('mes anterior vacío → deltas null', () => {
    const series: MonthPoint[] = [
      { year: 2026, month: 5, income: 0, expense: 0 },
      { year: 2026, month: 6, income: 200_000, expense: 60_000 },
    ]
    expect(reportKpis(series, new Date(2026, 6, 10))).toEqual({
      savingsRate: 70,
      savingsRateDelta: null,
      avgDailyExpense: 6_000,
      avgDailyExpenseDelta: null,
    })
  })
})

describe('kpiDeltas', () => {
  it('variación porcentual vs mes anterior', () => {
    expect(kpiDeltas([
      { year: 2026, month: 5, income: 300_000, expense: 100_000 },
      { year: 2026, month: 6, income: 330_000, expense: 90_000 },
    ])).toEqual({ incomePct: 10, expensePct: -10 })
  })
  it('previo en 0 → null', () => {
    expect(kpiDeltas([
      { year: 2026, month: 5, income: 0, expense: 100_000 },
      { year: 2026, month: 6, income: 330_000, expense: 0 },
    ])).toEqual({ incomePct: null, expensePct: -100 })
  })
})

describe('categoryTotalsForRange', () => {
  const cats = [
    { id: 'c1', name: 'Comida', colorHex: '#3B82F6' },
    { id: 'c2', name: 'Casa', colorHex: '#10B981' },
  ]
  it('rango inclusive, orden desc y Otros para sin categoría', () => {
    const top = categoryTotalsForRange(
      [
        tx({ amount: 30_000, date: new Date(Date.UTC(2026, 1, 1)) }),  // feb: borde inferior
        tx({ amount: 63_000, date: new Date(Date.UTC(2026, 6, 31)) }), // jul: borde superior
        tx({ categoryId: 'c2', amount: 160_000, date: new Date(Date.UTC(2026, 4, 10)) }),
        tx({ categoryId: null, amount: 5_000, date: new Date(Date.UTC(2026, 3, 2)) }),
        tx({ amount: 99_000, date: new Date(Date.UTC(2026, 0, 31)) }), // ene: fuera
        tx({ type: 'INCOME', amount: 500_000, date: new Date(Date.UTC(2026, 4, 1)) }),
        tx({ status: 'PENDING', amount: 77_000, date: new Date(Date.UTC(2026, 4, 2)) }),
      ],
      cats,
      { year: 2026, month: 1 },
      { year: 2026, month: 6 },
    )
    expect(top.map((c) => [c.name, c.total])).toEqual([
      ['Casa', 160_000], ['Comida', 93_000], ['Otros', 5_000],
    ])
    expect(top[2].colorHex).toBe('#8A857E')
  })
})

describe('linePoints', () => {
  it('escala con margen superior del 10%', () => {
    expect(linePoints([0, 50, 100], 640, 200, 100)).toBe('0,200 320,110 640,20')
  })
  it('vacío o max 0 → cadena vacía', () => {
    expect(linePoints([], 640, 200, 100)).toBe('')
    expect(linePoints([1, 2], 640, 200, 0)).toBe('')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/reports.test.ts`
Expected: FAIL, `Cannot find module '@/lib/reports'`.

- [ ] **Step 3: Implementar**

Crear `lib/reports.ts`:

```ts
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
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/reports.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/reports.ts tests/reports.test.ts
git commit -m "feat: lib/reports puro — serie mensual, KPIs con deltas, rango de categorías y polyline"
```

---

### Task 2: Componentes, `BarsChart`, `CashflowChart`, `ReportStat`, `CategoryBars` + delta en `KpiCard`

**Files:**
- Create: `components/growly/bars-chart.tsx`
- Create: `components/growly/cashflow-chart.tsx`
- Create: `components/growly/report-stat.tsx`
- Create: `components/growly/category-bars.tsx`
- Modify: `components/growly/kpi-card.tsx` (añadir prop `delta`)
- Test: `tests/report-components.test.tsx`

**Interfaces:**
- Consumes: `MonthPoint`/`RangeCategoryTotal`/`linePoints` (Task 1), `shortMonthName` de `@/lib/calendar`, `<Money>`.
- Produces (Tasks 3-4 dependen de estas props exactas):
  - `BarsChart({ series: MonthPoint[] })`: barras agrupadas, altura % del máximo de la serie, mes actual (último) en negrita.
  - `CashflowChart({ series: MonthPoint[] })`: SVG 640×200: línea ingresos sólida (`#10b981`, grosor 3) + área `rgba(16,185,129,.1)`, línea gastos punteada (`#c9584f`, `2 5`), 3 gridlines, meses abajo.
  - `ReportStat({ label: string; value: string; delta: { text: string; good: boolean } | null })`
  - `CategoryBars({ items: RangeCategoryTotal[] })`: barra proporcional al máximo, color de la categoría.
  - `KpiCard` gana `delta?: { text: string; good: boolean } | null`: línea "▲ 8% vs jun" verde (`text-acc`) si good, roja (`text-destructive`) si no. La prop `subtitle` existente no cambia.

- [ ] **Step 1: Escribir los tests**

Crear `tests/report-components.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BarsChart } from '@/components/growly/bars-chart'
import { CashflowChart } from '@/components/growly/cashflow-chart'
import { ReportStat } from '@/components/growly/report-stat'
import { CategoryBars } from '@/components/growly/category-bars'
import { KpiCard } from '@/components/growly/kpi-card'

const series = [
  { year: 2026, month: 5, income: 100_000, expense: 50_000 },
  { year: 2026, month: 6, income: 200_000, expense: 100_000 },
]

describe('BarsChart', () => {
  it('altura proporcional al máximo y mes actual en negrita', () => {
    render(<BarsChart series={series} />)
    expect(screen.getByText('Ingresos vs Gastos')).toBeInTheDocument()
    expect(screen.getByTestId('bar-income-1')).toHaveStyle({ height: '100%' })
    expect(screen.getByTestId('bar-income-0')).toHaveStyle({ height: '50%' })
    expect(screen.getByTestId('bar-expense-1')).toHaveStyle({ height: '50%' })
    expect(screen.getByText('jul').className).toContain('font-extrabold')
    expect(screen.getByText('jun').className).not.toContain('font-extrabold')
  })
})

describe('CashflowChart', () => {
  it('polylines de ingresos y gastos con puntos escalados', () => {
    render(<CashflowChart series={series} />)
    expect(screen.getByText('Flujo de caja')).toBeInTheDocument()
    // max 200_000: ingresos [100k, 200k] → "0,110 640,20"; gastos [50k, 100k] → "0,155 640,110"
    expect(screen.getByTestId('cashflow-income')).toHaveAttribute('points', '0,110 640,20')
    expect(screen.getByTestId('cashflow-expense')).toHaveAttribute('points', '0,155 640,110')
  })
})

describe('ReportStat', () => {
  it('delta verde cuando es buena, roja cuando no; sin delta no renderiza línea', () => {
    const { rerender } = render(
      <ReportStat label="Tasa de ahorro" value="37%" delta={{ text: '+5 pts vs jun', good: true }} />,
    )
    expect(screen.getByText('37%')).toBeInTheDocument()
    expect(screen.getByText('+5 pts vs jun').className).toContain('text-acc')
    rerender(<ReportStat label="Gasto medio/día" value="$125" delta={{ text: '+$8 vs jun', good: false }} />)
    expect(screen.getByText('+$8 vs jun').className).toContain('text-destructive')
    rerender(<ReportStat label="Tasa de ahorro" value="0%" delta={null} />)
    expect(screen.queryByText(/vs /)).not.toBeInTheDocument()
  })
})

describe('CategoryBars', () => {
  it('barras proporcionales con el color de la categoría y vacío con mensaje', () => {
    const { rerender } = render(
      <CategoryBars
        items={[
          { id: 'c2', name: 'Casa', colorHex: '#10B981', total: 160_000 },
          { id: 'c1', name: 'Comida', colorHex: '#3B82F6', total: 80_000 },
        ]}
      />,
    )
    expect(screen.getByTestId('catbar-c2')).toHaveStyle({ width: '100%', backgroundColor: '#10B981' })
    expect(screen.getByTestId('catbar-c1')).toHaveStyle({ width: '50%', backgroundColor: '#3B82F6' })
    rerender(<CategoryBars items={[]} />)
    expect(screen.getByText('Sin gastos en este periodo.')).toBeInTheDocument()
  })
})

describe('KpiCard · delta', () => {
  it('renderiza el delta con el color según good', () => {
    const { rerender } = render(
      <KpiCard label="Ingresos" cents={612_000} accent="income" delta={{ text: '▲ 8% vs jun', good: true }} />,
    )
    expect(screen.getByText('▲ 8% vs jun').className).toContain('text-acc')
    rerender(
      <KpiCard label="Gastos" cents={388_000} accent="expense" delta={{ text: '▲ 4% vs jun', good: false }} />,
    )
    expect(screen.getByText('▲ 4% vs jun').className).toContain('text-destructive')
    rerender(<KpiCard label="Gastos" cents={388_000} accent="expense" delta={null} />)
    expect(screen.queryByText(/vs jun/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/report-components.test.tsx`
Expected: FAIL, módulos inexistentes / prop `delta` inexistente.

- [ ] **Step 3: Implementar**

Crear `components/growly/bars-chart.tsx`:

```tsx
import type { MonthPoint } from '@/lib/reports'
import { shortMonthName } from '@/lib/calendar'

export function BarsChart({ series }: { series: MonthPoint[] }) {
  const max = Math.max(1, ...series.map((p) => Math.max(p.income, p.expense)))
  const last = series.length - 1
  return (
    <div className="rounded-[22px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[15px] font-extrabold text-foreground">Ingresos vs Gastos</span>
        <div className="flex gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-acc" aria-hidden /> Ing.
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-destructive" aria-hidden /> Gasto
          </span>
        </div>
      </div>
      <div className="flex h-[130px] items-end justify-between gap-3">
        {series.map((p, i) => (
          <div key={`${p.year}-${p.month}`} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex h-[110px] items-end gap-1">
              <div
                data-testid={`bar-income-${i}`}
                className="w-[11px] rounded-[3px] bg-acc"
                style={{ height: `${Math.round((p.income / max) * 100)}%` }}
              />
              <div
                data-testid={`bar-expense-${i}`}
                className="w-[11px] rounded-[3px] bg-destructive"
                style={{ height: `${Math.round((p.expense / max) * 100)}%` }}
              />
            </div>
            <span
              className={`text-[10px] ${i === last ? 'font-extrabold text-foreground' : 'font-semibold text-muted-foreground'}`}
            >
              {shortMonthName(p.month)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Crear `components/growly/cashflow-chart.tsx`:

```tsx
import { linePoints, type MonthPoint } from '@/lib/reports'
import { shortMonthName } from '@/lib/calendar'

const W = 640
const H = 200

export function CashflowChart({ series }: { series: MonthPoint[] }) {
  const max = Math.max(1, ...series.map((p) => Math.max(p.income, p.expense)))
  const income = linePoints(series.map((p) => p.income), W, H, max)
  const expense = linePoints(series.map((p) => p.expense), W, H, max)
  const last = series.length - 1
  return (
    <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4">
        <div className="text-base font-extrabold text-foreground">Flujo de caja</div>
        <div className="text-xs text-muted-foreground">Últimos 6 meses</div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="200"
        preserveAspectRatio="none"
        role="img"
        aria-label="Flujo de caja de los últimos 6 meses"
      >
        <line x1="0" y1="50" x2={W} y2="50" stroke="var(--line)" strokeWidth="1" />
        <line x1="0" y1="100" x2={W} y2="100" stroke="var(--line)" strokeWidth="1" />
        <line x1="0" y1="150" x2={W} y2="150" stroke="var(--line)" strokeWidth="1" />
        {income && (
          <>
            <polyline
              data-testid="cashflow-income"
              points={income}
              fill="none"
              stroke="#10b981"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline points={`${income} ${W},${H} 0,${H}`} fill="rgba(16,185,129,.1)" stroke="none" />
          </>
        )}
        {expense && (
          <polyline
            data-testid="cashflow-expense"
            points={expense}
            fill="none"
            stroke="#c9584f"
            strokeWidth="2.4"
            strokeDasharray="2 5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <div className="mt-2 flex justify-between px-1">
        {series.map((p, i) => (
          <span
            key={`${p.year}-${p.month}`}
            className={`text-[11px] ${i === last ? 'font-extrabold text-foreground' : 'text-muted-foreground'}`}
          >
            {shortMonthName(p.month)}
          </span>
        ))}
      </div>
    </div>
  )
}
```

Crear `components/growly/report-stat.tsx`:

```tsx
export function ReportStat({
  label, value, delta,
}: {
  label: string
  value: string
  delta: { text: string; good: boolean } | null
}) {
  return (
    <div className="flex-1 rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="text-[22px] font-extrabold text-foreground">{value}</div>
      {delta && (
        <div className={`mt-0.5 text-[11px] font-bold ${delta.good ? 'text-acc' : 'text-destructive'}`}>
          {delta.text}
        </div>
      )}
    </div>
  )
}
```

Crear `components/growly/category-bars.tsx`:

```tsx
import { Money } from '@/components/growly/money'
import type { RangeCategoryTotal } from '@/lib/reports'

export function CategoryBars({ items }: { items: RangeCategoryTotal[] }) {
  const max = Math.max(1, ...items.map((c) => c.total))
  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3.5 text-sm font-extrabold text-foreground">Top categorías</div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin gastos en este periodo.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((c) => (
            <div key={c.id}>
              <div className="mb-1.5 flex justify-between">
                <span className="text-[13px] font-semibold text-muted-foreground">{c.name}</span>
                <Money cents={c.total} withCents={false} className="text-[13px] font-extrabold text-foreground" />
              </div>
              <div className="h-1.5 overflow-hidden rounded-[3px] bg-muted">
                <div
                  data-testid={`catbar-${c.id}`}
                  className="h-full rounded-[3px]"
                  style={{ width: `${Math.round((c.total / max) * 100)}%`, backgroundColor: c.colorHex }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

Modificar `components/growly/kpi-card.tsx`: reemplazar TODO el contenido por:

```tsx
import { Money } from '@/components/growly/money'
import { cn } from '@/lib/utils'

export function KpiCard({
  label, cents, accent = 'neutral', subtitle, signed = false, delta,
}: {
  label: string
  cents: number
  accent?: 'income' | 'expense' | 'neutral'
  subtitle?: string
  signed?: boolean
  delta?: { text: string; good: boolean } | null
}) {
  const dot = accent === 'income' ? 'bg-primary/15 text-primary'
    : accent === 'expense' ? 'bg-destructive/15 text-destructive'
    : 'bg-info/15 text-info'
  return (
    <div className="rounded-[20px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className={cn('mb-3 flex h-8 w-8 items-center justify-center rounded-[10px]', dot)}>
        <span className="text-sm font-extrabold">$</span>
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <Money cents={cents} signed={signed} className="text-2xl font-extrabold text-foreground" />
      {subtitle && <div className="mt-1 text-xs font-bold text-acc">{subtitle}</div>}
      {delta && (
        <div className={cn('mt-1 text-xs font-bold', delta.good ? 'text-acc' : 'text-destructive')}>
          {delta.text}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verificar que pasan (y que lo existente sigue verde)**

Run: `npx vitest run tests/report-components.test.tsx tests/dashboard-components.test.tsx`
Expected: PASS (5 nuevos + los existentes de dashboard-components sin cambios).

- [ ] **Step 5: Commit**

```bash
git add components/growly/bars-chart.tsx components/growly/cashflow-chart.tsx components/growly/report-stat.tsx components/growly/category-bars.tsx components/growly/kpi-card.tsx tests/report-components.test.tsx
git commit -m "feat: charts SVG propios y delta en KpiCard"
```

---

### Task 3: Página `/reportes`

**Files:**
- Modify: `app/(app)/reportes/page.tsx` (hoy es un placeholder `ComingSoon` de 2 líneas, se reemplaza entero)
- Test: `tests/reportes-page.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`monthlySeries`, `reportKpis`, `categoryTotalsForRange`), Task 2 (`BarsChart`, `ReportStat`, `CategoryBars`), `shortMonthName`, `formatMoney`, `getTransactionsForUser`, `getCategoriesForUser`.
- Produces: página server component en `/reportes` con `?p=1a` para 12 meses (default 6).

Reglas de presentación de deltas (spec §6.2):
- Tasa de ahorro: `+N pts vs <mes-1>` (good si delta ≥ 0) / `−N pts…` (good false).
- Gasto medio/día: `−$N vs <mes-1>` (good si delta ≤ 0) / `+$N…` (good false). El signo − es U+2212 como `<SignedAmount>`.
- Top categorías: hasta 5.
- Estado vacío cuando la serie completa está en 0.

- [ ] **Step 1: Escribir los tests**

Crear `tests/reportes-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const getTransactionsForUser = vi.fn()
vi.mock('@/lib/transactions', () => ({
  getTransactionsForUser: (...a: unknown[]) => getTransactionsForUser(...a),
}))
vi.mock('@/lib/categories', () => ({
  getCategoriesForUser: vi.fn(async () => [
    { id: 'c1', name: 'Alimentación', colorHex: '#3B82F6', icon: 'utensils', kind: 'EXPENSE' },
  ]),
}))

import ReportesPage from '@/app/(app)/reportes/page'

// reloj fijado: 12 jul 2026 → mes actual julio, anterior junio
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 12))
})
afterAll(() => vi.useRealTimers())
beforeEach(() => getTransactionsForUser.mockReset())

const txns = [
  { type: 'INCOME', amount: 300_000, date: new Date(Date.UTC(2026, 6, 4)), status: 'CLEARED', categoryId: null },
  { type: 'EXPENSE', amount: 90_000, date: new Date(Date.UTC(2026, 6, 5)), status: 'CLEARED', categoryId: 'c1' },
  { type: 'INCOME', amount: 300_000, date: new Date(Date.UTC(2026, 5, 4)), status: 'CLEARED', categoryId: null },
  { type: 'EXPENSE', amount: 189_000, date: new Date(Date.UTC(2026, 5, 6)), status: 'CLEARED', categoryId: 'c1' },
]

describe('página /reportes', () => {
  it('con datos: chart, KPIs con deltas y top categorías', async () => {
    getTransactionsForUser.mockResolvedValue(txns)
    render(await ReportesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Reportes')).toBeInTheDocument()
    expect(screen.getByText('Ingresos vs Gastos')).toBeInTheDocument()
    // jul: tasa 70 (jun: 37) → +33 pts; medio/día jul 7500 (12 días), jun 6300 → +$12
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.getByText('+33 pts vs jun')).toBeInTheDocument()
    expect(screen.getByText('+$12 vs jun')).toBeInTheDocument()
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    // toggle
    expect(screen.getByRole('link', { name: '6 meses' })).toHaveAttribute('href', '/reportes')
    expect(screen.getByRole('link', { name: 'Año' })).toHaveAttribute('href', '/reportes?p=1a')
  })

  it('sin datos: estado vacío', async () => {
    getTransactionsForUser.mockResolvedValue([])
    render(await ReportesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/Aún no hay datos suficientes/)).toBeInTheDocument()
    expect(screen.queryByText('Ingresos vs Gastos')).not.toBeInTheDocument()
  })
})
```

Nota de cálculo del test 1: gasto medio/día jul = 90 000/12 = 7 500; jun = 189 000/30 = 6 300; delta +1 200 centavos → `formatMoney(1200, { withCents: false })` = `$12` → texto `+$12 vs jun` (good false → rojo, no asertado aquí; el color ya se asertó en Task 2).

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/reportes-page.test.tsx`
Expected: FAIL, la página actual renderiza `ComingSoon`.

- [ ] **Step 3: Implementar la página**

Reemplazar TODO el contenido de `app/(app)/reportes/page.tsx`:

```tsx
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getTransactionsForUser } from '@/lib/transactions'
import { getCategoriesForUser } from '@/lib/categories'
import { monthlySeries, reportKpis, categoryTotalsForRange } from '@/lib/reports'
import { shortMonthName } from '@/lib/calendar'
import { formatMoney } from '@/lib/money'
import { BarsChart } from '@/components/growly/bars-chart'
import { ReportStat } from '@/components/growly/report-stat'
import { CategoryBars } from '@/components/growly/category-bars'

const tabCls = (active: boolean) =>
  `rounded-[11px] px-4 py-2 text-sm font-bold ${
    active ? 'bg-forest text-white' : 'border border-border bg-card text-muted-foreground'
  }`

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const { p } = await searchParams
  const months = p === '1a' ? 12 : 6
  const now = new Date()

  const [txns, categories] = await Promise.all([
    getTransactionsForUser(session.user.id),
    getCategoriesForUser(session.user.id),
  ])
  const series = monthlySeries(txns, now, months)
  const kpis = reportKpis(series, now)
  const top = categoryTotalsForRange(
    txns,
    categories.map((c) => ({ id: c.id, name: c.name, colorHex: c.colorHex })),
    { year: series[0].year, month: series[0].month },
    { year: series[series.length - 1].year, month: series[series.length - 1].month },
  ).slice(0, 5)
  const hasData = series.some((pt) => pt.income > 0 || pt.expense > 0)
  const prevLabel = shortMonthName(series[series.length - 2].month)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Reportes</h1>
        <div className="flex gap-2">
          <Link href="/reportes" className={tabCls(months === 6)}>6 meses</Link>
          <Link href="/reportes?p=1a" className={tabCls(months === 12)}>Año</Link>
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">
            Aún no hay datos suficientes. Registra movimientos para ver tus estadísticas.
          </p>
        </div>
      ) : (
        <>
          <BarsChart series={series} />
          <div className="flex flex-col gap-3 sm:flex-row">
            <ReportStat
              label="Tasa de ahorro"
              value={`${kpis.savingsRate}%`}
              delta={
                kpis.savingsRateDelta === null
                  ? null
                  : {
                      text: `${kpis.savingsRateDelta >= 0 ? '+' : '−'}${Math.abs(kpis.savingsRateDelta)} pts vs ${prevLabel}`,
                      good: kpis.savingsRateDelta >= 0,
                    }
              }
            />
            <ReportStat
              label="Gasto medio/día"
              value={formatMoney(kpis.avgDailyExpense, { withCents: false })}
              delta={
                kpis.avgDailyExpenseDelta === null
                  ? null
                  : {
                      text: `${kpis.avgDailyExpenseDelta <= 0 ? '−' : '+'}${formatMoney(Math.abs(kpis.avgDailyExpenseDelta), { withCents: false })} vs ${prevLabel}`,
                      good: kpis.avgDailyExpenseDelta <= 0,
                    }
              }
            />
          </div>
          <CategoryBars items={top} />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verificar que pasan (y lint)**

Run: `npx vitest run tests/reportes-page.test.tsx`
Expected: PASS (2 tests).

Run: `npm run lint`
Expected: sin errores nuevos sobre el baseline (category-donut.tsx).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/reportes/page.tsx" tests/reportes-page.test.tsx
git commit -m "feat: página /reportes con toggle de periodo, KPIs con deltas y top categorías"
```

---

### Task 4: Dashboard, `cashflow` + `deltas` en `getDashboardData` y recolocación del grid

**Files:**
- Modify: `lib/dashboard.ts` (función `getDashboardData`)
- Modify: `app/(app)/page.tsx` (nueva fila Flujo de caja + donut; Recientes a ancho completo; deltas en KPIs)
- Test: Modify `tests/dashboard.test.ts` (añadir un describe al final)

**Interfaces:**
- Consumes: `monthlySeries`/`kpiDeltas` (Task 1), `CashflowChart` (Task 2), `KpiCard.delta` (Task 2), `shortMonthName`.
- Produces: `getDashboardData` devuelve además `cashflow: MonthPoint[]` (6 meses) y `deltas: { incomePct: number | null; expensePct: number | null }`.
- Layout final del dashboard (spec §6.3, diseño web): fila 1 hero+KPIs (con deltas en Ingresos/Gastos) · fila 2 NUEVA `md:grid-cols-[1.8fr_1fr]` **CashflowChart | CategoryDonut** · fila 3 Presupuesto | Próximos pagos | Metas (sin cambios) · fila 4 **Movimientos recientes a ancho completo** (contenido interno byte-idéntico; solo se desenvuelve del grid de 2 columnas de C3).

- [ ] **Step 1: Test del data layer (RED)**

Añadir al FINAL de `tests/dashboard.test.ts` (imports ya presentes de los describes de C2/C3, no duplicar):

```ts
describe.skipIf(!process.env.DATABASE_URL)('getDashboardData · cashflow y deltas', () => {
  const email = `dashflow_${Date.now()}@growly.app`
  let uid = ''
  const now = new Date()

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'DashFlow', email } })
    uid = u.id
    const a = await prisma.account.create({ data: { userId: uid, name: 'C', type: 'CHECKING' } })
    await prisma.transaction.create({
      data: {
        userId: uid, accountId: a.id, type: 'INCOME', amount: 100_000,
        description: 'Nómina', date: now, status: 'CLEARED',
      },
    })
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: uid } })
    await prisma.account.deleteMany({ where: { userId: uid } })
    await prisma.user.delete({ where: { id: uid } })
  })

  it('devuelve la serie de 6 meses y deltas', async () => {
    const d = await getDashboardData(uid, now)
    expect(d.cashflow).toHaveLength(6)
    const cur = d.cashflow[5]
    expect([cur.year, cur.month]).toEqual([now.getFullYear(), now.getMonth()])
    expect(cur.income).toBe(100_000)
    // mes anterior sin datos → deltas null
    expect(d.deltas).toEqual({ incomePct: null, expensePct: null })
  })
})
```

Run: `npx vitest run tests/dashboard.test.ts`
Expected: FAIL, `d.cashflow` es `undefined`.

- [ ] **Step 2: Ampliar `getDashboardData` (GREEN)**

En `lib/dashboard.ts`:

1. Añadir a los imports (junto a los de budgets/goals):

```ts
import { monthlySeries, kpiDeltas } from '@/lib/reports'
```

2. Antes del `return` de `getDashboardData`, añadir:

```ts
  const cashflow = monthlySeries(txns, now, 6)
  const deltas = kpiDeltas(cashflow)
```

3. En el objeto del `return`, añadir las claves:

```ts
    cashflow,
    deltas,
```

Run: `npx vitest run tests/dashboard.test.ts`
Expected: PASS (los existentes + 1 nuevo).

- [ ] **Step 3: Recolocar el dashboard**

En `app/(app)/page.tsx`:

1. Añadir imports:

```tsx
import { CashflowChart } from '@/components/growly/cashflow-chart'
import { shortMonthName } from '@/lib/calendar'
```

2. Dentro del componente, tras obtener `d`, añadir:

```tsx
  const prevShort = shortMonthName(d.cashflow[d.cashflow.length - 2].month)
  const deltaText = (pct: number) =>
    `${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)}% vs ${prevShort}`
```

3. Pasar los deltas a los dos KPI (el de Ahorro no cambia):

```tsx
        <KpiCard
          label="Ingresos"
          cents={d.monthly.income}
          accent="income"
          delta={d.deltas.incomePct === null ? null : { text: deltaText(d.deltas.incomePct), good: d.deltas.incomePct >= 0 }}
        />
        <KpiCard
          label="Gastos"
          cents={d.monthly.expense}
          accent="expense"
          delta={d.deltas.expensePct === null ? null : { text: deltaText(d.deltas.expensePct), good: d.deltas.expensePct <= 0 }}
        />
```

4. Insertar la fila nueva justo DESPUÉS del cierre de la fila 1 (hero + KPIs) y ANTES de la fila Presupuesto | Próximos | Metas:

```tsx
      <div className="grid gap-4 md:grid-cols-[1.8fr_1fr]">
        <CashflowChart series={d.cashflow} />
        <CategoryDonut breakdown={d.breakdown} />
      </div>
```

5. En la fila de 2 columnas de C3 (`grid gap-4 md:grid-cols-2` con `<CategoryDonut …/>` y la card "Movimientos recientes"): quitar el `<CategoryDonut …/>` (ya vive en la fila nueva) y DESENVOLVER la card "Movimientos recientes" del grid, queda como hija directa a ancho completo, con su contenido interno byte-idéntico.

Run: `npm run lint`
Expected: sin errores nuevos sobre el baseline.

Run: `npx vitest run --testTimeout=20000`
Expected: TODA la suite verde.

- [ ] **Step 4: Commit**

```bash
git add lib/dashboard.ts "app/(app)/page.tsx" tests/dashboard.test.ts
git commit -m "feat: flujo de caja y deltas de KPI en el dashboard"
```

---

### Task 5: e2e, reportes con datos reales y flujo de caja en el dashboard

**Files:**
- Test: `tests/e2e/reportes.spec.ts`

**Interfaces:**
- Consumes: flujo completo de Tasks 1-4 más registro/cuentas/movimientos existentes. Usa la categoría del sistema "Alimentación" (seed) para el gasto.

- [ ] **Step 1: Escribir el e2e**

Crear `tests/e2e/reportes.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('reportes: ingreso + gasto de hoy se reflejan en /reportes y el dashboard', async ({ page }) => {
  const email = `e2e_rep_${Date.now()}@growly.app`
  const now = new Date()
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // registro
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Rep')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // cuenta
  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  // ingreso de $3,000 hoy
  await page.goto('/movimientos')
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByRole('button', { name: 'Ingreso' }).click()
  await page.getByLabel('Importe').fill('3000')
  await page.getByLabel('Descripción').fill('Nómina')
  await page.getByLabel('Fecha').fill(hoy)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Nómina')).toBeVisible()

  // gasto de $600 hoy en Alimentación
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByLabel('Importe').fill('600')
  await page.getByLabel('Descripción').fill('Súper')
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimentación' })
  await page.getByLabel('Fecha').fill(hoy)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Súper')).toBeVisible()

  // /reportes: chart, tasa de ahorro (3000−600)/3000 = 80% y top categorías
  await page.goto('/reportes')
  await expect(page.getByText('Ingresos vs Gastos')).toBeVisible()
  await expect(page.getByText('80%')).toBeVisible()
  await expect(page.getByText('Alimentación')).toBeVisible()

  // dashboard: flujo de caja visible
  await page.goto('/')
  await expect(page.getByText('Flujo de caja')).toBeVisible()
})
```

Notas:
- `{ exact: true }` en el `getByLabel('Categoría')` del diálogo de movimientos por consistencia con el patrón de C2 (colisiones de strict-mode con nombres accesibles de diálogos).
- El botón "Ingreso" es el segmento del TransactionDialog (`SEG`), no un link.

- [ ] **Step 2: Ejecutarlo y verificar que pasa**

Run: `npx playwright test tests/e2e/reportes.spec.ts`
Expected: PASS. (Cold-start conocido del dev server: si falla el registro→redirect en frío, re-ejecutar una vez en caliente; `--trace on` solo si falla en caliente. NO debilitar aserciones; desambiguación strict-mode permitida y documentada.)

- [ ] **Step 3: Suite completa**

Run: `npx vitest run --testTimeout=20000`
Expected: toda la suite unit verde.

Run: `npx playwright test`
Expected: los 9 e2e verdes (8 previos + este).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/reportes.spec.ts
git commit -m "test: e2e de reportes — KPIs y top categorías con datos reales"
```

---

## Spec coverage (self-review)

- §6.1 `monthlySeries`/`reportKpis`/`categoryTotalsForRange`/`kpiDeltas` (+ `linePoints` para el SVG) → Task 1, con la convención UTC de C4 y CLEARED-only consistente con los KPIs.
- §6.2 página `/reportes`: toggle "6 meses | Año" (`?p=1a`), barras agrupadas SVG propio con leyenda y mes actual en negrita, dos KPI tiles con deltas (+pts verde / −$ verde), top 5 categorías con barra proporcional, estado vacío → Tasks 2-3.
- §6.3 dashboard: fila "Flujo de caja" `1.8fr/1fr` con el donut recolocado (SVG línea+área+punteada, 3 gridlines, meses), Recientes a ancho completo, `KpiCard.delta` "▲ 8% vs jun" con verde según dirección buena, `getDashboardData` con `cashflow`+`deltas` (evaluateAlertsForUser queda para D2) → Tasks 2 y 4.
- §7 testing D1: series (ventana, cruce de año, vacíos, PENDING/TRANSFer), KPIs (deltas, mes previo vacío), rango inclusive, linePoints determinista, componentes (alturas/puntos/colores de delta), páginas RTL con reloj fijado, e2e con datos reales → Tasks 1-5.
- §8: rama `feature/fase-3-d1`, sin migración, review final de rama antes del merge (lo orquesta la skill).
- Lecciones previas: fechas de test con `Date.UTC`, reloj fijado, `{ exact: true }` preventivo en el e2e, tokens en superficies claras.
