# Growly Fase 2 · C4: Calendario · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calendario financiero en `/calendario` (rejilla mensual lunes-primero con dots por tipo de evento + agenda del día seleccionado) que mezcla movimientos, pagos programados y cortes/vencimientos de tarjeta, precedido por la unificación de la convención de fechas UTC pendiente desde C1.

**Architecture:** Task 1 unifica la convención de fechas en TODO el código existente: las fechas de datos son fechas-calendario a medianoche UTC y se leen con getters UTC; "hoy"/"mes actual" salen de los componentes locales de `now`. Sobre esa base, `lib/calendar.ts` (puro) calcula eventos por día, totales del mes (CLEARED + PENDING) y la rejilla; `CalendarView` (client) maneja la selección de día; la página server materializa recurrencias, enriquece los movimientos con su categoría y delega en el componente. Reutiliza `lib/month-param` y `MonthNav` de C2.

**Tech Stack:** Next.js 16 App Router (Server Components + client component de selección), Prisma 6.19.3 + Neon, Vitest + RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-08-growly-fase-2-design.md` (secciones 8, 10, 11) + backlog C1 (`.superpowers/sdd/progress-c1.md`: "ANTES DE C4: unificar convención de fechas UTC").

**Rama:** `feature/fase-2-c4` desde `master`. Merge a `master` tras el review final de rama (patrón C1/C2/C3). Al completar C4, la Fase 2 queda COMPLETA.

## Global Constraints

- **Convención de fechas UNIFICADA (la establece Task 1; el resto del plan la asume):** las fechas de datos (`Transaction.date`, `GoalContribution.date`) son **fechas-calendario a medianoche UTC** (vienen de inputs `type=date` → `z.coerce.date`) y se LEEN SIEMPRE con getters UTC (`getUTCFullYear`/`getUTCMonth`/`getUTCDate`). "Hoy" y "el mes actual" se derivan de los componentes **locales** de `now` (el día de calendario del usuario). Ninguna función debe usar getters locales sobre fechas de datos.
- **Dinero:** centavos `Int`; formateo con `<Money>`/`<SignedAmount>` existentes. El monto de la agenda va con signo (`SignedAmount`: income +, expense −); los eventos de tarjeta no llevan importe.
- **Multi-tenant:** `userId` solo de `auth()`; la página redirige a /login sin sesión.
- **El calendario es planificación:** `calendarMonthTotals` cuenta CLEARED **y** PENDING (a diferencia de los KPIs del dashboard, que solo CLEARED), se documenta en el código. TRANSFER no es ingreso ni gasto para los totales; en la agenda se muestra como `expense` con meta "Transferencia".
- **Dots (spec §8.1):** verde = ingreso, rojo = gasto/pago, gris = evento de tarjeta; prioridad **rojo > verde > gris**.
- **Tarjetas (spec §8.1):** solo `CREDIT_CARD` no archivadas; "Corte · <tarjeta>" el `statementDay`, "Pago tarjeta · <tarjeta>" el `dueDay`; si el día no existe en el mes, se ajusta al último día (31 → 30/28/29). Sin importe.
- **Semana empieza LUNES**; cabecera `L M X J V S D`. Hoy = círculo verde relleno; selección de día client-side, default hoy (o día 1 si el mes visto no es el actual). Meses navegables con `?m=YYYY-MM` (1-12 humano) vía `parseMonthParam`/`MonthNav` de C2 con `basePath="/calendario"`.
- **La página llama `materializeRecurringForUser` antes de leer** (spec §8.2): los PENDING de recurrencias deben aparecer.
- **Sidebar:** nueva entrada en `NAV_ITEMS` ENTRE Metas y Cuentas: `{ href: '/calendario', label: 'Calendario', icon: CalendarDays }`.
- **UI en español**, tokens del design system; botones de solo-icono o solo-número con `aria-label`.
- **Tests con fecha:** reloj fijado con `vi.useFakeTimers({ toFake: ['Date'] })` (solo Date) donde "hoy" importe. **Nota para Task 1:** los tests RED/GREEN de la unificación dependen del offset de la máquina de desarrollo (UTC-6): el RED solo se manifiesta en offsets negativos, pero el GREEN es correcto en cualquier máquina.
- **Next.js 16:** `searchParams` es `Promise` (await). Prisma pinned 6.19.3. `.env` local y gitignored, no tocar/imprimir/commitear.
- **Tests de DB:** `describe.skipIf(!process.env.DATABASE_URL)`; timeouts de Neon → reintentar con `--testTimeout=20000` y anotarlo.
- Commits `feat:`/`test:`/`fix:` en español.

---

### Task 1: Unificación de la convención de fechas UTC (prerequisito, backlog C1)

**Files:**
- Modify: `lib/transactions.ts` (función `groupTransactionsByDay` y helpers de dayKey)
- Modify: `lib/dashboard.ts` (helper `inMonth`)
- Modify: `lib/budgets.ts` (filtro de fecha en `budgetProgress`)
- Modify: `lib/goals.ts` (filtro de mes en `goalTotals`)
- Test: Modify `tests/transactions.test.ts`, `tests/dashboard.test.ts`, `tests/budgets.test.ts`, `tests/goals.test.ts` (añadir tests de boundary; ajustar el `now` de un test existente)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: MISMAS firmas públicas (`groupTransactionsByDay`, `monthlyTotals`, `categoryBreakdown`, `budgetProgress`, `goalTotals`), solo cambia la semántica interna de lectura de fechas a getters UTC. Las Tasks 2-5 asumen esta convención.

**El bug que arregla:** los datos se guardan a medianoche UTC pero se leían con getters locales; en offsets negativos (UTC-6) un movimiento del "12 jul" se agrupaba bajo "11 jul", y un gasto del día 1 del mes contaba en el mes anterior (KPIs, presupuesto, metas).

- [ ] **Step 1: Añadir los tests de boundary (RED en la máquina de desarrollo, UTC-6)**

1. En `tests/transactions.test.ts`, dentro del describe `groupTransactionsByDay (puro)`: cambiar la línea del `now` existente de

```ts
  const now = new Date('2026-07-06T12:00:00Z')
```

a (constructor local: el "hoy" del usuario es su día de calendario local, y así el test es determinista en cualquier máquina):

```ts
  const now = new Date(2026, 6, 6, 12)
```

y añadir al final del describe:

```ts
  it('medianoche UTC agrupa por el día de calendario guardado (no se corre un día en offsets negativos)', () => {
    const txns = [{ id: 'm', date: new Date('2026-07-06T00:00:00Z') }]
    const groups = groupTransactionsByDay(txns, new Date(2026, 6, 6, 12))
    expect(groups[0].label).toBe('Hoy')
  })
```

2. En `tests/dashboard.test.ts`, al final del describe `monthlyTotals`:

```ts
  it('día 1 del mes a medianoche UTC cuenta en ese mes (convención UTC)', () => {
    const txns: DashTx[] = [
      { type: 'EXPENSE', amount: 10000, date: new Date('2026-07-01T00:00:00Z'), status: 'CLEARED' },
    ]
    expect(monthlyTotals(txns, 2026, 6).expense).toBe(10000)
  })
```

3. En `tests/budgets.test.ts`, al final del describe `budgetProgress`:

```ts
  it('gasto del día 1 a medianoche UTC cuenta en el mes (convención UTC)', () => {
    const { totals } = budgetProgress(
      budgets,
      [tx({ date: new Date(Date.UTC(2026, 6, 1)), amount: 10_000 })],
      2026, 6,
    )
    expect(totals.spent).toBe(10_000)
  })
```

4. En `tests/goals.test.ts`, al final del describe `goalTotals`:

```ts
  it('aporte del día 1 a medianoche UTC cuenta en el mes (convención UTC)', () => {
    expect(goalTotals([{ amount: 5_000, date: new Date(Date.UTC(2026, 6, 1)) }], now))
      .toEqual({ saved: 5_000, savedThisMonth: 5_000 })
  })
```

- [ ] **Step 2: Verificar que los 4 nuevos fallan (y solo ellos)**

Run: `npx vitest run tests/transactions.test.ts tests/dashboard.test.ts tests/budgets.test.ts tests/goals.test.ts --testTimeout=20000`
Expected: FAIL exactamente en los 4 tests nuevos (en UTC-6 la medianoche UTC cae en el día/mes anterior local). Todos los tests preexistentes siguen verdes.

- [ ] **Step 3: Cambiar las 4 funciones a getters UTC**

1. En `lib/transactions.ts`, reemplazar las líneas del helper `dayKey` (la constante actual `const dayKey = (d: Date) => ...`) y la función `groupTransactionsByDay` completa por:

```ts
// Los movimientos guardan una fecha-calendario a medianoche UTC (input type=date →
// z.coerce.date). Se agrupan y etiquetan con getters UTC; "hoy/ayer" es el día de
// calendario LOCAL del usuario (now es un instante real).
const dayKeyUTC = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
const dayKeyLocal = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export function groupTransactionsByDay<T extends { date: Date }>(
  txns: T[],
  now: Date,
): { label: string; key: string; items: T[] }[] {
  const sorted = [...txns].sort((a, b) => b.date.getTime() - a.date.getTime())
  const todayKey = dayKeyLocal(now)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yKey = dayKeyLocal(yesterday)

  const groups: { label: string; key: string; items: T[] }[] = []
  const index = new Map<string, { label: string; key: string; items: T[] }>()
  for (const t of sorted) {
    const key = dayKeyUTC(t.date)
    let g = index.get(key)
    if (!g) {
      const label =
        key === todayKey ? 'Hoy' : key === yKey ? 'Ayer' : `${t.date.getUTCDate()} ${MESES[t.date.getUTCMonth()]}`
      g = { label, key, items: [] }
      index.set(key, g)
      groups.push(g)
    }
    g.items.push(t)
  }
  return groups
}
```

(La constante `MESES` existente no cambia.)

2. En `lib/dashboard.ts`, reemplazar el helper `inMonth`:

```ts
// Las fechas de los movimientos son fechas-calendario a medianoche UTC → getters UTC.
// year/month vienen de los componentes LOCALES de now (el mes actual del usuario).
const inMonth = (d: Date, year: number, month: number) =>
  d.getUTCFullYear() === year && d.getUTCMonth() === month
```

3. En `lib/budgets.ts`, dentro de `budgetProgress`, reemplazar la línea

```ts
    if (t.date.getFullYear() !== year || t.date.getMonth() !== month) continue
```

por

```ts
    if (t.date.getUTCFullYear() !== year || t.date.getUTCMonth() !== month) continue
```

y actualizar el comentario de cabecera de la función a:

```ts
// spent = EXPENSE CLEARED del mes. Fechas de datos = fecha-calendario a medianoche UTC
// → getters UTC; year/month = componentes locales de now (mismo criterio que lib/dashboard).
```

4. En `lib/goals.ts`, dentro de `goalTotals`, reemplazar la línea

```ts
    if (c.date.getFullYear() === now.getFullYear() && c.date.getMonth() === now.getMonth()) {
```

por

```ts
    if (c.date.getUTCFullYear() === now.getFullYear() && c.date.getUTCMonth() === now.getMonth()) {
```

y actualizar su comentario de cabecera a:

```ts
// "este mes": las fechas de aportes son fechas-calendario a medianoche UTC → getters UTC;
// el mes actual sale de los componentes locales de now (mismo criterio que lib/dashboard).
```

- [ ] **Step 4: Verificar GREEN y regresión completa**

Run: `npx vitest run tests/transactions.test.ts tests/dashboard.test.ts tests/budgets.test.ts tests/goals.test.ts --testTimeout=20000`
Expected: PASS (los 4 nuevos + todos los preexistentes).

Run: `npx vitest run --testTimeout=20000`
Expected: TODA la suite verde (205 + 4 nuevos). Si algún test preexistente falla por esta convención, es un caso que dependía del bug, arreglar el TEST citando la convención nueva, no revertir la función; documentarlo en el reporte.

- [ ] **Step 5: Commit**

```bash
git add lib/transactions.ts lib/dashboard.ts lib/budgets.ts lib/goals.ts tests/transactions.test.ts tests/dashboard.test.ts tests/budgets.test.ts tests/goals.test.ts
git commit -m "fix: convención unificada de fechas UTC en agrupado por día, KPIs, presupuesto y metas"
```

---

### Task 2: `lib/calendar.ts` puro, eventos, totales, dots, rejilla y etiquetas

**Files:**
- Create: `lib/calendar.ts`
- Test: `tests/calendar.test.ts`

**Interfaces:**
- Consumes: la convención UTC de Task 1 (fechas de datos con getters UTC).
- Produces (Tasks 3-4 dependen de estos nombres exactos):
  - `type CalTx = { id: string; type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amount: number; description: string; date: Date; status?: 'CLEARED' | 'PENDING'; categoryName?: string | null; categoryIcon?: string | null }`
  - `type CalCard = { name: string; type: string; archived?: boolean; statementDay?: number | null; dueDay?: number | null }`
  - `type CalendarEvent = { kind: 'income' | 'expense' | 'card'; date: Date; label: string; amount?: number; meta: string; icon: string | null; pending: boolean }`
  - `calendarEvents(txns: CalTx[], accounts: CalCard[], year: number, month: number): Map<number, CalendarEvent[]>`: clave = día del mes (UTC).
  - `calendarMonthTotals(txns: CalTx[], year: number, month: number): { income: number; expense: number }`
  - `dayDotTone(events: CalendarEvent[]): 'expense' | 'income' | 'card' | null`
  - `monthGridDays(year: number, month: number): (number | null)[]`: lunes-primero, nulls de relleno, longitud múltiplo de 7.
  - `agendaDayLabel(year: number, month: number, day: number): string`: `'LUNES · 6 JUL'`.
  - `daysInMonth(year: number, month: number): number`, `shortMonthName(month: number): string`.

- [ ] **Step 1: Escribir los tests**

Crear `tests/calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  calendarEvents, calendarMonthTotals, dayDotTone, monthGridDays, agendaDayLabel,
  daysInMonth, shortMonthName, type CalTx, type CalCard, type CalendarEvent,
} from '@/lib/calendar'

const d = (day: number) => new Date(Date.UTC(2026, 6, day))

const tx = (over: Partial<CalTx>): CalTx => ({
  id: 'x', type: 'EXPENSE', amount: 10_000, description: 'Gasto', date: d(5),
  status: 'CLEARED', categoryName: 'Casa', categoryIcon: 'home', ...over,
})

const visa: CalCard = { name: 'Visa', type: 'CREDIT_CARD', archived: false, statementDay: 15, dueDay: 31 }

describe('calendarEvents', () => {
  it('agrupa movimientos del mes por día UTC con meta según estado', () => {
    const map = calendarEvents(
      [
        tx({ id: 'a', date: d(5) }),
        tx({ id: 'b', date: d(5), type: 'INCOME', description: 'Nómina', categoryName: 'Sueldo' }),
        tx({ id: 'c', date: d(20), status: 'PENDING', description: 'Alquiler' }),
        tx({ id: 'fuera', date: new Date(Date.UTC(2026, 5, 30)) }),
      ],
      [], 2026, 6,
    )
    expect(map.get(5)!.map((e) => e.kind)).toEqual(['expense', 'income'])
    expect(map.get(5)![0].meta).toBe('Casa')
    expect(map.get(5)![1].meta).toBe('Sueldo')
    expect(map.get(20)![0]).toMatchObject({ kind: 'expense', meta: 'Pago programado', pending: true, label: 'Alquiler' })
    expect(map.has(30)).toBe(false)
  })

  it('TRANSFER se muestra como expense con meta Transferencia', () => {
    const map = calendarEvents([tx({ type: 'TRANSFER', description: 'A ahorro' })], [], 2026, 6)
    expect(map.get(5)![0]).toMatchObject({ kind: 'expense', meta: 'Transferencia' })
  })

  it('tarjeta activa genera corte y pago; el día 31 se ajusta al último día del mes', () => {
    // junio 2026 tiene 30 días → dueDay 31 cae el 30
    const map = calendarEvents([], [visa], 2026, 5)
    expect(map.get(15)![0]).toMatchObject({ kind: 'card', label: 'Corte · Visa', meta: 'Corte de tarjeta', pending: false })
    expect(map.get(30)![0]).toMatchObject({ kind: 'card', label: 'Pago tarjeta · Visa', meta: 'Pago de tarjeta' })
    expect(map.get(15)![0].amount).toBeUndefined()
  })

  it('febrero no bisiesto: día 31 → 28', () => {
    const map = calendarEvents([], [visa], 2026, 1)
    expect(map.get(28)!.some((e) => e.label === 'Pago tarjeta · Visa')).toBe(true)
  })

  it('ignora tarjetas archivadas y cuentas no-tarjeta', () => {
    const map = calendarEvents(
      [],
      [
        { ...visa, archived: true },
        { name: 'Corriente', type: 'CHECKING', statementDay: 10, dueDay: 20 },
      ],
      2026, 6,
    )
    expect(map.size).toBe(0)
  })
})

describe('calendarMonthTotals', () => {
  it('cuenta CLEARED y PENDING; ignora TRANSFER y otros meses', () => {
    expect(
      calendarMonthTotals(
        [
          tx({ type: 'INCOME', amount: 300_000 }),
          tx({ amount: 90_000 }),
          tx({ amount: 50_000, status: 'PENDING' }),
          tx({ type: 'TRANSFER', amount: 70_000 }),
          tx({ amount: 99_000, date: new Date(Date.UTC(2026, 5, 30)) }),
        ],
        2026, 6,
      ),
    ).toEqual({ income: 300_000, expense: 140_000 })
  })
})

describe('dayDotTone', () => {
  const ev = (kind: CalendarEvent['kind']): CalendarEvent =>
    ({ kind, date: d(1), label: '', meta: '', icon: null, pending: false })
  it('prioridad rojo > verde > gris', () => {
    expect(dayDotTone([ev('card'), ev('income'), ev('expense')])).toBe('expense')
    expect(dayDotTone([ev('card'), ev('income')])).toBe('income')
    expect(dayDotTone([ev('card')])).toBe('card')
    expect(dayDotTone([])).toBeNull()
  })
})

describe('monthGridDays', () => {
  it('julio 2026 empieza miércoles: 2 huecos y padding a múltiplo de 7', () => {
    const cells = monthGridDays(2026, 6)
    expect(cells.slice(0, 3)).toEqual([null, null, 1])
    expect(cells.length % 7).toBe(0)
    expect(cells.filter((c) => c !== null).length).toBe(31)
    expect(cells[cells.length - 1]).toBeNull()
  })
  it('febrero 2026 empieza domingo: 6 huecos', () => {
    const cells = monthGridDays(2026, 1)
    expect(cells.slice(0, 7)).toEqual([null, null, null, null, null, null, 1])
    expect(cells.filter((c) => c !== null).length).toBe(28)
  })
})

describe('agendaDayLabel / daysInMonth / shortMonthName', () => {
  it('etiqueta día de semana UTC + día + mes corto', () => {
    expect(agendaDayLabel(2026, 6, 6)).toBe('LUNES · 6 JUL')
    expect(agendaDayLabel(2026, 6, 12)).toBe('DOMINGO · 12 JUL')
  })
  it('daysInMonth y shortMonthName', () => {
    expect(daysInMonth(2026, 6)).toBe(31)
    expect(daysInMonth(2026, 1)).toBe(28)
    expect(daysInMonth(2028, 1)).toBe(29)
    expect(shortMonthName(6)).toBe('jul')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/calendar.test.ts`
Expected: FAIL, `Cannot find module '@/lib/calendar'`.

- [ ] **Step 3: Implementar**

Crear `lib/calendar.ts`:

```ts
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
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/calendar.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/calendar.ts tests/calendar.test.ts
git commit -m "feat: lib/calendar puro — eventos por día, totales, dots, rejilla y etiquetas"
```

---

### Task 3: `CalendarView`, componente client de rejilla + agenda

**Files:**
- Create: `components/growly/calendar-view.tsx`
- Test: `tests/calendar-view.test.tsx`

**Interfaces:**
- Consumes: `agendaDayLabel`/`dayDotTone`/`CalendarEvent` (Task 2), `MonthNav` + `YearMonth` (C2), `<Money>`/`<SignedAmount>`, `CategoryIcon`, icono `CreditCard` de lucide.
- Produces (Task 4 la consume):
  - `CalendarView({ ym: YearMonth; todayDay: number | null; cells: (number | null)[]; eventsByDay: [number, CalendarEvent[]][]; totals: { income: number; expense: number }; monthShort: string })`: `todayDay` = día de hoy si el mes visto es el actual (si no, null); selección inicial `todayDay ?? 1`.

- [ ] **Step 1: Escribir los tests**

Crear `tests/calendar-view.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarView } from '@/components/growly/calendar-view'
import type { CalendarEvent } from '@/lib/calendar'

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  kind: 'expense', date: new Date(Date.UTC(2026, 6, 5)), label: 'Cine',
  amount: 10_000, meta: 'Entretenimiento', icon: 'ticket', pending: false, ...over,
})

// julio 2026 empieza miércoles → 2 huecos
const cells: (number | null)[] = [null, null, ...Array.from({ length: 31 }, (_, i) => i + 1)]
while (cells.length % 7 !== 0) cells.push(null)

const base = {
  ym: { year: 2026, month: 6 },
  todayDay: 12,
  cells,
  totals: { income: 612_000, expense: 203_600 },
  monthShort: 'jul',
}

describe('CalendarView', () => {
  it('chips de totales y cabecera de semana lunes-primero', () => {
    render(<CalendarView {...base} eventsByDay={[]} />)
    expect(screen.getByText(/Ingresos jul/)).toBeInTheDocument()
    expect(screen.getByText(/Pagos jul/)).toBeInTheDocument()
    expect(screen.getByText('X')).toBeInTheDocument() // miércoles en L M X J V S D
  })

  it('hoy en círculo verde y seleccionado por defecto; agenda del día', () => {
    render(<CalendarView {...base} eventsByDay={[[12, [ev({})]]]} />)
    expect(screen.getByTestId('calendar-today')).toHaveTextContent('12')
    expect(screen.getByText('DOMINGO · 12 JUL')).toBeInTheDocument()
    expect(screen.getByText('Cine')).toBeInTheDocument()
    expect(screen.getByText('Entretenimiento')).toBeInTheDocument()
  })

  it('dots con prioridad y el click cambia la agenda', async () => {
    const user = userEvent.setup()
    render(
      <CalendarView
        {...base}
        eventsByDay={[
          [5, [ev({ kind: 'income', label: 'Nómina', meta: 'Sueldo' }), ev({})]],
          [15, [ev({ kind: 'card', label: 'Corte · Visa', meta: 'Corte de tarjeta', amount: undefined })]],
        ]}
      />,
    )
    expect(screen.getByTestId('dot-5').className).toContain('bg-destructive')
    expect(screen.getByTestId('dot-15').className).toContain('bg-muted-foreground')
    await user.click(screen.getByRole('button', { name: 'Día 5' }))
    expect(screen.getByText('DOMINGO · 5 JUL')).toBeInTheDocument()
    expect(screen.getByText('Nómina')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Día 15' }))
    expect(screen.getByText('Corte · Visa')).toBeInTheDocument()
    expect(screen.getByText('Corte de tarjeta')).toBeInTheDocument()
  })

  it('PENDING en rojo y día vacío con mensaje', async () => {
    const user = userEvent.setup()
    render(
      <CalendarView
        {...base}
        eventsByDay={[[20, [ev({ pending: true, meta: 'Pago programado', label: 'Alquiler' })]]]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Día 20' }))
    expect(screen.getByText('Pago programado').className).toContain('text-destructive')
    await user.click(screen.getByRole('button', { name: 'Día 21' }))
    expect(screen.getByText('Sin eventos este día.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/calendar-view.test.tsx`
Expected: FAIL, módulo inexistente.

- [ ] **Step 3: Implementar**

Crear `components/growly/calendar-view.tsx`:

```tsx
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
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/calendar-view.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/growly/calendar-view.tsx tests/calendar-view.test.tsx
git commit -m "feat: CalendarView — rejilla lunes-primero con dots y agenda del día"
```

---

### Task 4: Página `/calendario` + entrada del sidebar

**Files:**
- Create: `app/(app)/calendario/page.tsx`
- Modify: `components/growly/nav-items.ts`
- Modify: `tests/sidebar.test.tsx`
- Test: `tests/calendario-page.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`calendarEvents`, `calendarMonthTotals`, `monthGridDays`, `shortMonthName`, `CalTx`), Task 3 (`CalendarView`), `parseMonthParam`/`isCurrentMonth` (C2), `materializeRecurringForUser`, `getTransactionsForUser`/`getAccountsForUser`/`getCategoriesForUser`.
- Produces: ruta `/calendario` + item de navegación.

- [ ] **Step 1: Escribir los tests**

1. Crear `tests/calendario-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/recurring', () => ({ materializeRecurringForUser: vi.fn(async () => {}) }))
vi.mock('@/lib/transactions', () => ({
  getTransactionsForUser: vi.fn(async () => [
    {
      id: 't1', type: 'EXPENSE', amount: 12_000, description: 'Cine',
      date: new Date(Date.UTC(2026, 6, 12)), status: 'CLEARED', categoryId: 'c1',
    },
  ]),
}))
vi.mock('@/lib/accounts', () => ({
  getAccountsForUser: vi.fn(async () => [
    { id: 'a1', name: 'Visa', type: 'CREDIT_CARD', archived: false, statementDay: 15, dueDay: 28 },
  ]),
}))
vi.mock('@/lib/categories', () => ({
  getCategoriesForUser: vi.fn(async () => [
    { id: 'c1', name: 'Entretenimiento', icon: 'ticket', colorHex: '#C9584F', kind: 'EXPENSE' },
  ]),
}))

import CalendarioPage from '@/app/(app)/calendario/page'
import { materializeRecurringForUser } from '@/lib/recurring'

// reloj fijado: 12 jul 2026 (domingo) para que "hoy" sea determinista
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 12))
})
afterAll(() => vi.useRealTimers())

describe('página /calendario', () => {
  it('mes actual: hoy seleccionado, agenda con el gasto, dots, chips y materialización', async () => {
    render(await CalendarioPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Calendario')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-today')).toHaveTextContent('12')
    expect(screen.getByText('DOMINGO · 12 JUL')).toBeInTheDocument()
    expect(screen.getByText('Cine')).toBeInTheDocument()
    expect(screen.getByText('Entretenimiento')).toBeInTheDocument()
    expect(screen.getByTestId('dot-12').className).toContain('bg-destructive')
    expect(screen.getByTestId('dot-15').className).toContain('bg-muted-foreground')
    expect(screen.getByText(/Pagos jul/)).toBeInTheDocument()
    expect(materializeRecurringForUser).toHaveBeenCalledWith('u1', expect.any(Date))
  })

  it('otro mes: sin círculo de hoy y día 1 seleccionado', async () => {
    render(await CalendarioPage({ searchParams: Promise.resolve({ m: '2026-06' }) }))
    expect(screen.queryByTestId('calendar-today')).not.toBeInTheDocument()
    expect(screen.getByText('LUNES · 1 JUN')).toBeInTheDocument()
  })
})
```

2. En `tests/sidebar.test.tsx`, reemplazar el test existente por:

```tsx
  it('muestra los 7 items de navegación', () => {
    render(<Sidebar />)
    for (const label of ['Inicio', 'Movimientos', 'Presupuesto', 'Metas', 'Calendario', 'Cuentas y tarjetas', 'Reportes']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/calendario-page.test.tsx tests/sidebar.test.tsx`
Expected: FAIL, la página no existe y el sidebar no tiene 'Calendario'.

- [ ] **Step 3: Implementar**

1. En `components/growly/nav-items.ts`, reemplazar TODO el contenido por:

```ts
import { Home, ArrowUpDown, PieChart, Target, CalendarDays, CreditCard, BarChart3, type LucideIcon } from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { href: '/',            label: 'Inicio',             icon: Home },
  { href: '/movimientos', label: 'Movimientos',        icon: ArrowUpDown },
  { href: '/presupuesto', label: 'Presupuesto',        icon: PieChart },
  { href: '/metas',       label: 'Metas',              icon: Target },
  { href: '/calendario',  label: 'Calendario',         icon: CalendarDays },
  { href: '/cuentas',     label: 'Cuentas y tarjetas', icon: CreditCard },
  { href: '/reportes',    label: 'Reportes',           icon: BarChart3 },
]
```

2. Crear `app/(app)/calendario/page.tsx`:

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getTransactionsForUser } from '@/lib/transactions'
import { getAccountsForUser } from '@/lib/accounts'
import { getCategoriesForUser } from '@/lib/categories'
import { materializeRecurringForUser } from '@/lib/recurring'
import { parseMonthParam, isCurrentMonth } from '@/lib/month-param'
import {
  calendarEvents, calendarMonthTotals, monthGridDays, shortMonthName, type CalTx,
} from '@/lib/calendar'
import { CalendarView } from '@/components/growly/calendar-view'

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { m } = await searchParams
  const now = new Date()
  const ym = parseMonthParam(m, now)

  await materializeRecurringForUser(userId, now)

  const [txns, accounts, categories] = await Promise.all([
    getTransactionsForUser(userId),
    getAccountsForUser(userId),
    getCategoriesForUser(userId),
  ])
  const catById = new Map(categories.map((c) => [c.id, c]))
  const calTxns: CalTx[] = txns.map((t) => {
    const cat = t.categoryId ? catById.get(t.categoryId) : null
    return {
      id: t.id,
      type: t.type,
      amount: t.amount,
      description: t.description,
      date: t.date,
      status: t.status,
      categoryName: cat?.name ?? null,
      categoryIcon: cat?.icon ?? null,
    }
  })

  const events = calendarEvents(calTxns, accounts, ym.year, ym.month)
  const totals = calendarMonthTotals(calTxns, ym.year, ym.month)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Calendario</h1>
      <CalendarView
        ym={ym}
        todayDay={isCurrentMonth(ym, now) ? now.getDate() : null}
        cells={monthGridDays(ym.year, ym.month)}
        eventsByDay={[...events.entries()]}
        totals={totals}
        monthShort={shortMonthName(ym.month)}
      />
    </div>
  )
}
```

- [ ] **Step 4: Verificar que pasan (y lint + suite completa)**

Run: `npx vitest run tests/calendario-page.test.tsx tests/sidebar.test.tsx`
Expected: PASS (2 + 1 tests).

Run: `npm run lint`
Expected: sin errores nuevos (baseline conocido: 1 error pre-existente en `components/growly/category-donut.tsx`).

Run: `npx vitest run --testTimeout=20000`
Expected: TODA la suite verde.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/calendario/page.tsx" components/growly/nav-items.ts tests/calendario-page.test.tsx tests/sidebar.test.tsx
git commit -m "feat: página /calendario con agenda del día y entrada en el sidebar"
```

---

### Task 5: e2e, gasto de hoy visible en el calendario

**Files:**
- Test: `tests/e2e/calendario.spec.ts`

**Interfaces:**
- Consumes: flujo completo de Tasks 1-4 más registro/cuentas/movimientos existentes.

- [ ] **Step 1: Escribir el e2e**

Crear `tests/e2e/calendario.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('calendario: un gasto de hoy aparece en la agenda y en los chips', async ({ page }) => {
  const email = `e2e_cal_${Date.now()}@growly.app`
  // fecha local de hoy (día de calendario del usuario) para el input date
  const now = new Date()
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // registro
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Cal')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // cuenta + gasto de hoy
  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  await page.goto('/movimientos')
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByLabel('Importe').fill('45.50')
  await page.getByLabel('Descripción').fill('Cine')
  await page.getByLabel('Fecha').fill(hoy)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Cine')).toBeVisible()

  // al calendario desde el sidebar; hoy está seleccionado por defecto
  await page.getByRole('link', { name: 'Calendario' }).click()
  await expect(page).toHaveURL(/\/calendario/)
  await expect(page.getByText('Cine')).toBeVisible()
  await expect(page.getByText(/Pagos/)).toBeVisible()
  await expect(page.getByText('−$45.50')).toBeVisible()
})
```

- [ ] **Step 2: Ejecutarlo y verificar que pasa**

Run: `npx playwright test tests/e2e/calendario.spec.ts`
Expected: PASS. (Cold-start conocido: si falla en el paso registro→redirect en frío, re-ejecutar una vez con el server caliente; depurar con `--trace on` solo si falla en caliente. NO debilitar aserciones; desambiguación strict-mode permitida y documentada.)

- [ ] **Step 3: Suite completa**

Run: `npx vitest run --testTimeout=20000`
Expected: toda la suite unit verde.

Run: `npx playwright test`
Expected: los 8 e2e verdes (7 previos + este).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/calendario.spec.ts
git commit -m "test: e2e de calendario — gasto de hoy en agenda y chips"
```

---

## Spec coverage (self-review)

- Backlog C1 pre-C4 (unificar fechas UTC en groupTransactionsByDay/monthlyTotals) → Task 1, extendido también a budgetProgress/goalTotals para que TODA la app comparta la convención; tests de boundary en los 4 archivos.
- §8.1 `calendarEvents` (Map por día; movimientos todos los status con PENDING etiquetado "Pago/Ingreso programado"; tarjetas activas con Corte/Pago y ajuste 31→último día; sin importe) → Task 2. `calendarMonthTotals` con CLEARED+PENDING y nota de diferencia con KPIs → Task 2. Dots verde/rojo/gris con prioridad rojo > verde > gris → Task 2 (`dayDotTone`) + Task 3 (render).
- §8.2 ruta propia `/calendario` con `?m=` (Task 4), entrada en NAV_ITEMS entre Metas y Cuentas con CalendarDays (Task 4), dos paneles (tarjeta calendario con chips + navegación ‹mes› + cabecera L M X J V S D lunes-primero + hoy en círculo verde + dots | agenda del día "DOMINGO · 12 JUL" con icono, subtítulo rojo si PENDING, Corte/Pago de tarjeta, monto con signo) → Tasks 3-4. Selección client-side default hoy/día 1 → Task 3. `materializeRecurringForUser` antes de leer → Task 4 (con aserción en el test de página).
- §10 calendario: merge de eventos, ajuste statementDay/dueDay 31→30/28, totales con PENDING, prioridad de dots → Task 2; e2e adicional (gasto de hoy en agenda/chips) → Task 5.
- §11: rama `feature/fase-2-c4`, review final de rama antes del merge (lo orquesta la skill). Sin migración (C4 no toca schema). Al mergear, Fase 2 completa.
- TRANSFER: decisión documentada (agenda como expense/"Transferencia"; excluido de totales, coherente con monthlyTotals).
- Lecciones C1-C3 incorporadas: reloj fijado en tests de página, `aria-label` en los botones de día, reutilización de month-param/MonthNav, convención UTC como Global Constraint.
