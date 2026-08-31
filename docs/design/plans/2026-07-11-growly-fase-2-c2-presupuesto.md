# Growly Fase 2 · C2 — Presupuesto · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presupuesto mensual por categoría: un límite en centavos por categoría de gasto y mes, con auto-copia del mes anterior, página `/presupuesto` (hero con progreso y predicción run-rate, tarjetas por categoría, alta/edición/quita) y card de resumen en el dashboard.

**Architecture:** `lib/budgets.ts` separa lo puro (`budgetProgress`, `budgetForecast`) del acceso a datos (`getBudgetsForMonth` con auto-copia, `upsertBudgetForUser`, `deleteBudgetForUser`, todo scoped por `userId`). `lib/month-param.ts` centraliza la conversión mes humano 1-12 del query param `?m=` ↔ mes JS 0-11 (se reutilizará en `/calendario` en C4). `lib/budget-actions.ts` expone server actions con `auth()` + Zod + ownership. El dashboard incorpora el resumen vía `getDashboardData`.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Prisma 6.19.3 + Neon PostgreSQL, Zod 4, shadcn/ui sobre Base UI, Vitest + RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-08-growly-fase-2-design.md` (secciones 4, 6, 9, 10, 11).

**Rama:** `feature/fase-2-c2` desde `master`. Merge a `master` tras el review final de rama (patrón C1).

## Global Constraints

- **Dinero:** siempre centavos `Int`. Nunca Float. Formateo con `formatMoney`/`<Money>`/`<SignedAmount>` existentes.
- **Multi-tenant:** todo acceso a datos va scoped por `userId` obtenido de `auth()` en la action/página. Jamás un `userId` del cliente. Mutaciones sobre recursos existentes con `updateMany`/`deleteMany` + `where: { id, userId }`.
- **Convención de meses:** en DB y código `month` es **0-11** (convención JS `Date`, igual que `lib/dashboard`). En el query param `?m=` es **1-12 humano** (`2026-07` = julio). La conversión vive SOLO en `lib/month-param.ts`.
- **Convención de fechas del gasto (igual que Fase 1):** `spent` cuenta EXPENSE **CLEARED** del mes usando getters **locales** (`getFullYear`/`getMonth`), exactamente como `monthlyTotals` de `lib/dashboard.ts` — los KPIs y el presupuesto deben coincidir. (La unificación a UTC es un item de backlog previo a C4; NO lo hagas en C2.)
- **UI en español**, tokens del design system en `app/globals.css` (`bg-card`, `text-muted-foreground`, `bg-forest`, `text-destructive` = `#c9584f`, `text-warning` = `#e0ad2e`, `text-acc`, `shadow-[var(--shadow-card)]`, radios `rounded-[11px]`/`rounded-[20px]`/`rounded-[22px]`).
- **Diálogos:** shadcn sobre **Base UI** — `DialogTrigger` usa la prop `render={<elemento/>}` (NO children), `Dialog` controlado con `open`/`onOpenChange`. Ids de inputs con `React.useId()` (puede haber varios diálogos montados en la misma página). Copiar el patrón de `components/growly/transaction-dialog.tsx` y `recurring-dialog.tsx`.
- **Next.js 16:** `searchParams` es `Promise` y se hace `await`. Este repo usa una versión de Next con breaking changes — ante cualquier duda de API, leer `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- **Prisma pinned a 6.19.3** — no actualizar dependencias.
- **`.env` es local y gitignored** (contiene `DATABASE_URL` de Neon y `AUTH_SECRET`). NO modificarlo, NO imprimirlo, NO commitearlo.
- **Tests de DB:** patrón `describe.skipIf(!process.env.DATABASE_URL)`, email único por archivo (`` `algo_${Date.now()}@growly.app` ``), cleanup en `afterAll` scoped al usuario del test. `tests/setup.ts` ya carga dotenv y desconecta prisma.
- **Comandos** (Windows PowerShell): `npx vitest run <archivo>` para unit, `npx playwright test <archivo>` para e2e (levanta `next dev` solo), `npx prisma migrate dev --name <nombre>` para migraciones.
- Commits frecuentes con mensajes `feat:`/`test:`/`fix:` en español, como el historial existente.

---

### Task 1: Schema Prisma — modelo `Budget` + migración

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/budget-schema.test.ts`

**Interfaces:**
- Consumes: modelos existentes `User`, `Category`.
- Produces: modelo `Budget` (campos: `id`, `userId`, `categoryId`, `year`, `month` 0-11, `amount` centavos, `createdAt`, `updatedAt`; unique `[userId, categoryId, year, month]`). Tasks 4-5 dependen del nombre del unique compuesto generado por Prisma: `userId_categoryId_year_month`.

- [ ] **Step 1: Escribir el test (falla porque el modelo no existe)**

Crear `tests/budget-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('schema Budget', () => {
  it('el cliente expone budget', async () => {
    const count = await prisma.budget.count()
    expect(typeof count).toBe('number')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run tests/budget-schema.test.ts`
Expected: FAIL — `prisma.budget` es `undefined` (TypeError) o error de tipo.

- [ ] **Step 3: Añadir el schema**

En `prisma/schema.prisma`:

1. Añadir al final del archivo:

```prisma
model Budget {
  id         String   @id @default(cuid())
  userId     String
  categoryId String
  year       Int
  month      Int // 0-11, convención JS Date — igual que lib/dashboard
  amount     Int // centavos
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([userId, categoryId, year, month])
  @@index([userId, year, month])
}
```

2. Relaciones inversas — añadir una línea en cada modelo:
   - `model User` (junto a `recurringRules`): `budgets Budget[]`
   - `model Category` (junto a `recurringRules`): `budgets Budget[]`

3. Ejecutar `npx prisma format` para normalizar la alineación.

- [ ] **Step 4: Crear la migración y verificar que el test pasa**

Run: `npx prisma migrate dev --name budgets`
Expected: migración `*_budgets` creada en `prisma/migrations/` y aplicada; `prisma generate` corre solo.

Run: `npx vitest run tests/budget-schema.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/budget-schema.test.ts
git commit -m "feat: modelo Budget con unique por usuario/categoría/mes"
```

---

### Task 2: `lib/budgets.ts` puro — `budgetProgress` + `budgetForecast`

**Files:**
- Create: `lib/budgets.ts`
- Test: `tests/budgets.test.ts`

**Interfaces:**
- Consumes: nada (funciones puras).
- Produces (Tasks 7-8 dependen de estos nombres y tipos exactos):
  - `type BudgetLike = { id: string; categoryId: string; amount: number }`
  - `type BudgetTx = { type: 'INCOME' | 'EXPENSE' | 'TRANSFER'; amount: number; date: Date; categoryId?: string | null; status?: 'CLEARED' | 'PENDING' }`
  - `type CategoryProgress = { budgetId: string; categoryId: string; limit: number; spent: number; pct: number; over: boolean }`
  - `type BudgetTotals = { limit: number; spent: number; pct: number; available: number }`
  - `budgetProgress(budgets: BudgetLike[], txns: BudgetTx[], year: number, month: number): { categories: CategoryProgress[]; totals: BudgetTotals }` — categorías ordenadas por `pct` desc.
  - `budgetForecast(totals: { spent: number }, now: Date): { projected: number; daysLeft: number }`

- [ ] **Step 1: Escribir los tests (fallan porque el módulo no existe)**

Crear `tests/budgets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { budgetProgress, budgetForecast } from '@/lib/budgets'

const budgets = [
  { id: 'b1', categoryId: 'comida', amount: 100_000 },
  { id: 'b2', categoryId: 'transporte', amount: 50_000 },
]

const tx = (over: Partial<Parameters<typeof budgetProgress>[1][number]>) => ({
  type: 'EXPENSE' as const,
  amount: 10_000,
  date: new Date(2026, 6, 10),
  categoryId: 'comida',
  status: 'CLEARED' as const,
  ...over,
})

describe('budgetProgress', () => {
  it('acumula el gasto CLEARED del mes por categoría', () => {
    const { categories, totals } = budgetProgress(
      budgets,
      [tx({ amount: 30_000 }), tx({ amount: 63_000, date: new Date(2026, 6, 20) })],
      2026, 6,
    )
    const comida = categories.find((c) => c.categoryId === 'comida')!
    expect(comida).toMatchObject({ budgetId: 'b1', limit: 100_000, spent: 93_000, pct: 93, over: false })
    expect(totals).toEqual({ limit: 150_000, spent: 93_000, pct: 62, available: 57_000 })
  })

  it('marca excedido y permite pct > 100 y available negativo', () => {
    const { categories, totals } = budgetProgress(
      budgets,
      [tx({ categoryId: 'transporte', amount: 60_000 }), tx({ amount: 93_000 })],
      2026, 6,
    )
    const transporte = categories.find((c) => c.categoryId === 'transporte')!
    expect(transporte).toMatchObject({ spent: 60_000, pct: 120, over: true })
    expect(totals).toEqual({ limit: 150_000, spent: 153_000, pct: 102, available: -3_000 })
  })

  it('ordena las categorías por pct descendente', () => {
    const { categories } = budgetProgress(
      budgets,
      [tx({ categoryId: 'transporte', amount: 60_000 }), tx({ amount: 20_000 })],
      2026, 6,
    )
    expect(categories.map((c) => c.categoryId)).toEqual(['transporte', 'comida'])
  })

  it('sin gasto: spent 0, pct 0, over false', () => {
    const { categories, totals } = budgetProgress(budgets, [], 2026, 6)
    expect(categories.every((c) => c.spent === 0 && c.pct === 0 && !c.over)).toBe(true)
    expect(totals).toEqual({ limit: 150_000, spent: 0, pct: 0, available: 150_000 })
  })

  it('ignora PENDING, otros meses, INCOME/TRANSFER, sin categoría y categorías no presupuestadas', () => {
    const { totals } = budgetProgress(
      budgets,
      [
        tx({ status: 'PENDING', amount: 40_000 }),
        tx({ date: new Date(2026, 5, 30), amount: 99_000 }),
        tx({ type: 'INCOME', amount: 500_000 }),
        tx({ type: 'TRANSFER', amount: 70_000 }),
        tx({ categoryId: null, amount: 12_000 }),
        tx({ categoryId: 'ropa-sin-presupuesto', amount: 20_000 }),
      ],
      2026, 6,
    )
    expect(totals.spent).toBe(0)
  })

  it('sin budgets: totales a cero', () => {
    const { categories, totals } = budgetProgress([], [tx({})], 2026, 6)
    expect(categories).toEqual([])
    expect(totals).toEqual({ limit: 0, spent: 0, pct: 0, available: 0 })
  })
})

describe('budgetForecast', () => {
  it('proyección run-rate a mitad de mes', () => {
    // 4 jul 2026 (31 días): 40_000 / 4 × 31 = 310_000; quedan 27 días
    expect(budgetForecast({ spent: 40_000 }, new Date(2026, 6, 4)))
      .toEqual({ projected: 310_000, daysLeft: 27 })
  })

  it('día 1 sin gasto: proyección 0', () => {
    expect(budgetForecast({ spent: 0 }, new Date(2026, 6, 1)))
      .toEqual({ projected: 0, daysLeft: 30 })
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/budgets.test.ts`
Expected: FAIL — `Cannot find module '@/lib/budgets'` (o export inexistente).

- [ ] **Step 3: Implementar**

Crear `lib/budgets.ts`:

```ts
export type BudgetLike = { id: string; categoryId: string; amount: number }

export type BudgetTx = {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  amount: number
  date: Date
  categoryId?: string | null
  status?: 'CLEARED' | 'PENDING'
}

export type CategoryProgress = {
  budgetId: string
  categoryId: string
  limit: number
  spent: number
  pct: number // redondeado, sin cap (puede superar 100)
  over: boolean
}

export type BudgetTotals = { limit: number; spent: number; pct: number; available: number }

// spent = EXPENSE CLEARED del mes, con getters locales — misma convención que
// monthlyTotals en lib/dashboard: los KPIs y el presupuesto deben coincidir.
export function budgetProgress(
  budgets: BudgetLike[],
  txns: BudgetTx[],
  year: number,
  month: number,
): { categories: CategoryProgress[]; totals: BudgetTotals } {
  const spentByCat = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'EXPENSE' || t.status === 'PENDING' || !t.categoryId) continue
    if (t.date.getFullYear() !== year || t.date.getMonth() !== month) continue
    spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + t.amount)
  }

  const categories = budgets
    .map((b) => {
      const spent = spentByCat.get(b.categoryId) ?? 0
      return {
        budgetId: b.id,
        categoryId: b.categoryId,
        limit: b.amount,
        spent,
        pct: b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0,
        over: spent > b.amount,
      }
    })
    .sort((a, b) => b.pct - a.pct)

  const limit = categories.reduce((s, c) => s + c.limit, 0)
  const spent = categories.reduce((s, c) => s + c.spent, 0)
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0
  return { categories, totals: { limit, spent, pct, available: limit - spent } }
}

// Proyección run-rate del mes en curso: spent / días transcurridos × días del mes.
export function budgetForecast(totals: { spent: number }, now: Date): { projected: number; daysLeft: number } {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysElapsed = now.getDate()
  return {
    projected: Math.round((totals.spent / daysElapsed) * daysInMonth),
    daysLeft: daysInMonth - daysElapsed,
  }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/budgets.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/budgets.ts tests/budgets.test.ts
git commit -m "feat: budgetProgress y budgetForecast puros"
```

---

### Task 3: `lib/month-param.ts` — mes 1-12 del URL ↔ 0-11 del código

**Files:**
- Create: `lib/month-param.ts`
- Test: `tests/month-param.test.ts`

**Interfaces:**
- Consumes: nada (puro).
- Produces (Tasks 6-7 dependen de estos nombres exactos; C4 lo reutilizará para `/calendario`):
  - `type YearMonth = { year: number; month: number }` — `month` 0-11.
  - `parseMonthParam(m: string | undefined, now: Date): YearMonth` — acepta `"2026-07"` (mes humano 1-12); inválido/ausente → mes de `now`.
  - `monthParam(ym: YearMonth): string` — `{year: 2026, month: 6}` → `"2026-07"`.
  - `monthLabel(ym: YearMonth): string` — `"Julio 2026"`.
  - `prevMonth(ym: YearMonth): YearMonth`, `nextMonth(ym: YearMonth): YearMonth`.
  - `isCurrentMonth(ym: YearMonth, now: Date): boolean`.

- [ ] **Step 1: Escribir los tests**

Crear `tests/month-param.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  parseMonthParam, monthParam, monthLabel, prevMonth, nextMonth, isCurrentMonth,
} from '@/lib/month-param'

const now = new Date(2026, 6, 11) // 11 jul 2026

describe('parseMonthParam', () => {
  it('convierte mes humano 1-12 a 0-11', () => {
    expect(parseMonthParam('2026-07', now)).toEqual({ year: 2026, month: 6 })
    expect(parseMonthParam('2025-01', now)).toEqual({ year: 2025, month: 0 })
    expect(parseMonthParam('2025-12', now)).toEqual({ year: 2025, month: 11 })
  })
  it('ausente o inválido → mes actual', () => {
    const current = { year: 2026, month: 6 }
    expect(parseMonthParam(undefined, now)).toEqual(current)
    expect(parseMonthParam('garbage', now)).toEqual(current)
    expect(parseMonthParam('2026-13', now)).toEqual(current)
    expect(parseMonthParam('2026-00', now)).toEqual(current)
    expect(parseMonthParam('2026-7', now)).toEqual(current) // exige dos dígitos
  })
})

describe('monthParam / monthLabel', () => {
  it('formatea de vuelta a 1-12 con dos dígitos', () => {
    expect(monthParam({ year: 2026, month: 6 })).toBe('2026-07')
    expect(monthParam({ year: 2025, month: 11 })).toBe('2025-12')
  })
  it('etiqueta en español', () => {
    expect(monthLabel({ year: 2026, month: 6 })).toBe('Julio 2026')
    expect(monthLabel({ year: 2026, month: 0 })).toBe('Enero 2026')
  })
})

describe('prevMonth / nextMonth', () => {
  it('navega dentro del año', () => {
    expect(prevMonth({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 5 })
    expect(nextMonth({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 7 })
  })
  it('cruza el cambio de año', () => {
    expect(prevMonth({ year: 2026, month: 0 })).toEqual({ year: 2025, month: 11 })
    expect(nextMonth({ year: 2025, month: 11 })).toEqual({ year: 2026, month: 0 })
  })
})

describe('isCurrentMonth', () => {
  it('compara contra now', () => {
    expect(isCurrentMonth({ year: 2026, month: 6 }, now)).toBe(true)
    expect(isCurrentMonth({ year: 2026, month: 5 }, now)).toBe(false)
    expect(isCurrentMonth({ year: 2025, month: 6 }, now)).toBe(false)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/month-param.test.ts`
Expected: FAIL — `Cannot find module '@/lib/month-param'`.

- [ ] **Step 3: Implementar**

Crear `lib/month-param.ts`:

```ts
// Convención: en URL el mes es humano 1-12 ("2026-07" = julio); en código y DB es 0-11.
// Esta es la ÚNICA frontera donde se convierte. Compartido por /presupuesto y (C4) /calendario.

export type YearMonth = { year: number; month: number } // month 0-11

export function parseMonthParam(m: string | undefined, now: Date): YearMonth {
  const match = m ? /^(\d{4})-(\d{2})$/.exec(m) : null
  if (match) {
    const year = Number(match[1])
    const human = Number(match[2])
    if (human >= 1 && human <= 12) return { year, month: human - 1 }
  }
  return { year: now.getFullYear(), month: now.getMonth() }
}

export function monthParam({ year, month }: YearMonth): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function monthLabel({ year, month }: YearMonth): string {
  return `${MESES[month]} ${year}`
}

export function prevMonth({ year, month }: YearMonth): YearMonth {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
}

export function nextMonth({ year, month }: YearMonth): YearMonth {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
}

export function isCurrentMonth({ year, month }: YearMonth, now: Date): boolean {
  return year === now.getFullYear() && month === now.getMonth()
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/month-param.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/month-param.ts tests/month-param.test.ts
git commit -m "feat: helpers de mes para query param compartidos (presupuesto/calendario)"
```

---

### Task 4: `lib/budgets.ts` DB — `getBudgetsForMonth` (auto-copia) + upsert/delete

**Files:**
- Modify: `lib/budgets.ts` (añadir al final; lo puro de Task 2 no se toca)
- Test: `tests/budgets-db.test.ts`

**Interfaces:**
- Consumes: `prisma` de `@/lib/prisma`; modelo `Budget` (Task 1, unique `userId_categoryId_year_month`).
- Produces (Tasks 5 y 7-8 dependen de estas firmas):
  - `getBudgetsForMonth(userId: string, year: number, month: number, now?: Date): Promise<Budget[]>`
  - `upsertBudgetForUser(userId: string, data: { categoryId: string; year: number; month: number; amount: number }): Promise<Budget>`
  - `deleteBudgetForUser(userId: string, id: string): Promise<{ ok: boolean }>`

**Semántica de auto-copia (spec 6.1):** si el mes pedido es el ACTUAL (vs `now`), no tiene filas, y algún mes de los 12 anteriores sí, se copian los límites del más reciente. Meses pasados o futuros vacíos NO copian. La copia es un único `createMany` con `skipDuplicates` (atómico; el unique protege contra doble copia concurrente). Caso borde aceptado por la spec: si el usuario quita TODAS las categorías del mes actual, reaparecen al recargar.

- [ ] **Step 1: Escribir los tests**

Crear `tests/budgets-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getBudgetsForMonth, upsertBudgetForUser, deleteBudgetForUser } from '@/lib/budgets'

const email = `bud_${Date.now()}@growly.app`
let userId = ''
let otherId = ''
let catA = ''
let catB = ''

// "hoy" fijo: 15 jul 2026 → mes actual = {2026, 6}
const now = new Date(2026, 6, 15)
const Y = 2026
const MAY = 4, JUN = 5, JUL = 6, AGO = 7

describe.skipIf(!process.env.DATABASE_URL)('budgets DB', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Bud', email } })
    userId = u.id
    const o = await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })
    otherId = o.id
    const a = await prisma.category.create({ data: { userId, name: 'BudComida', kind: 'EXPENSE' } })
    const b = await prisma.category.create({ data: { userId, name: 'BudTransporte', kind: 'EXPENSE' } })
    catA = a.id
    catB = b.id
  })
  afterAll(async () => {
    await prisma.budget.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.category.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('upsert crea y luego actualiza sin duplicar', async () => {
    await upsertBudgetForUser(userId, { categoryId: catA, year: Y, month: JUN, amount: 40_000 })
    await upsertBudgetForUser(userId, { categoryId: catA, year: Y, month: JUN, amount: 50_000 })
    const rows = await prisma.budget.findMany({ where: { userId, year: Y, month: JUN } })
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(50_000)
    await upsertBudgetForUser(userId, { categoryId: catB, year: Y, month: JUN, amount: 20_000 })
  })

  it('mes pasado vacío NO copia', async () => {
    expect(await getBudgetsForMonth(userId, Y, MAY, now)).toEqual([])
  })

  it('mes futuro vacío NO copia', async () => {
    expect(await getBudgetsForMonth(userId, Y, AGO, now)).toEqual([])
  })

  it('auto-copia: mes actual vacío copia el mes anterior más reciente, idempotente', async () => {
    const first = await getBudgetsForMonth(userId, Y, JUL, now)
    expect(first).toHaveLength(2)
    expect(first.map((b) => b.amount).sort()).toEqual([20_000, 50_000])
    expect(first.every((b) => b.year === Y && b.month === JUL)).toBe(true)
    // segunda llamada: no duplica
    const second = await getBudgetsForMonth(userId, Y, JUL, now)
    expect(second).toHaveLength(2)
  })

  it('mes actual con filas NO re-copia', async () => {
    const jul = await prisma.budget.findFirst({ where: { userId, year: Y, month: JUL, categoryId: catA } })
    await upsertBudgetForUser(userId, { categoryId: catA, year: Y, month: JUL, amount: 77_000 })
    const rows = await getBudgetsForMonth(userId, Y, JUL, now)
    expect(rows.find((b) => b.id === jul!.id)!.amount).toBe(77_000)
    expect(rows).toHaveLength(2)
  })

  it('getBudgetsForMonth no devuelve budgets de otro usuario', async () => {
    expect(await getBudgetsForMonth(otherId, Y, JUN, now)).toEqual([])
  })

  it('deleteBudgetForUser respeta ownership', async () => {
    const row = await prisma.budget.findFirst({ where: { userId, year: Y, month: JUN, categoryId: catB } })
    expect(await deleteBudgetForUser(otherId, row!.id)).toEqual({ ok: false })
    expect(await deleteBudgetForUser(userId, row!.id)).toEqual({ ok: true })
    expect(await prisma.budget.count({ where: { id: row!.id } })).toBe(0)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/budgets-db.test.ts`
Expected: FAIL — los exports `getBudgetsForMonth`/`upsertBudgetForUser`/`deleteBudgetForUser` no existen.
(Si no hay `DATABASE_URL`, la suite entera se salta — ejecutar con el `.env` local presente.)

- [ ] **Step 3: Implementar**

Añadir al FINAL de `lib/budgets.ts`:

```ts
import { prisma } from '@/lib/prisma'

// Lee los budgets del mes pedido. Auto-copia (spec F2 §6.1): solo si el mes pedido
// es el actual, está vacío y algún mes de los 12 anteriores tiene filas — se copia
// el más reciente. La copia es un único createMany (atómico); skipDuplicates + el
// unique [userId, categoryId, year, month] protegen contra la doble copia concurrente.
export async function getBudgetsForMonth(
  userId: string,
  year: number,
  month: number,
  now: Date = new Date(),
) {
  const existing = await prisma.budget.findMany({
    where: { userId, year, month },
    orderBy: { createdAt: 'asc' },
  })
  if (existing.length > 0) return existing
  if (year !== now.getFullYear() || month !== now.getMonth()) return existing

  // pares (year, month) de los 12 meses anteriores al pedido
  const pairs: { year: number; month: number }[] = []
  let y = year
  let m = month
  for (let i = 0; i < 12; i++) {
    m -= 1
    if (m < 0) { m = 11; y -= 1 }
    pairs.push({ year: y, month: m })
  }
  const latest = await prisma.budget.findFirst({
    where: { userId, OR: pairs },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    select: { year: true, month: true },
  })
  if (!latest) return existing

  const source = await prisma.budget.findMany({
    where: { userId, year: latest.year, month: latest.month },
  })
  await prisma.budget.createMany({
    data: source.map((b) => ({ userId, categoryId: b.categoryId, year, month, amount: b.amount })),
    skipDuplicates: true,
  })
  return prisma.budget.findMany({ where: { userId, year, month }, orderBy: { createdAt: 'asc' } })
}

export function upsertBudgetForUser(
  userId: string,
  data: { categoryId: string; year: number; month: number; amount: number },
) {
  return prisma.budget.upsert({
    where: {
      userId_categoryId_year_month: {
        userId,
        categoryId: data.categoryId,
        year: data.year,
        month: data.month,
      },
    },
    create: { userId, ...data },
    update: { amount: data.amount },
  })
}

export async function deleteBudgetForUser(userId: string, id: string) {
  const res = await prisma.budget.deleteMany({ where: { id, userId } })
  return { ok: res.count > 0 }
}
```

- [ ] **Step 4: Verificar que pasan (y que lo puro sigue verde)**

Run: `npx vitest run tests/budgets-db.test.ts tests/budgets.test.ts`
Expected: PASS (7 + 8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/budgets.ts tests/budgets-db.test.ts
git commit -m "feat: getBudgetsForMonth con auto-copia del mes anterior + upsert/delete"
```

---

### Task 5: `budgetSchema` + `lib/budget-actions.ts`

**Files:**
- Modify: `lib/validators.ts` (añadir al final)
- Create: `lib/budget-actions.ts`
- Test: `tests/budget-actions.test.ts`

**Interfaces:**
- Consumes: `upsertBudgetForUser`/`deleteBudgetForUser` (Task 4), `auth` de `@/lib/auth`, `prisma`.
- Produces (Task 6 depende de estas firmas):
  - `budgetSchema` y `idSchema` en `lib/validators.ts`.
  - `upsertBudget(values: unknown): Promise<{ ok: true } | { ok: false; error: string }>`
  - `deleteBudget(id: unknown): Promise<{ ok: true } | { ok: false; error: string }>`

Nota: los ids de estas actions SÍ pasan por Zod (`idSchema`) — item prioritario del backlog del review de C1, aplicado a las actions nuevas. (Retrofit de las actions viejas queda en backlog, fuera de C2.)

- [ ] **Step 1: Escribir los tests**

Crear `tests/budget-actions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const email = `budact_${Date.now()}@growly.app`
let userId = ''
let otherId = ''
let catGasto = ''
let catIngreso = ''
let catAjena = ''

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { upsertBudget, deleteBudget } from '@/lib/budget-actions'

const Y = 2026
const JUL = 6

describe.skipIf(!process.env.DATABASE_URL)('budget actions', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'BudAct', email } })
    userId = u.id
    const o = await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })
    otherId = o.id
    catGasto = (await prisma.category.create({ data: { userId, name: 'ActComida', kind: 'EXPENSE' } })).id
    catIngreso = (await prisma.category.create({ data: { userId, name: 'ActSueldo', kind: 'INCOME' } })).id
    catAjena = (await prisma.category.create({ data: { userId: otherId, name: 'ActAjena', kind: 'EXPENSE' } })).id
  })
  afterAll(async () => {
    await prisma.budget.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.category.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('upsertBudget crea un presupuesto', async () => {
    const res = await upsertBudget({ categoryId: catGasto, year: Y, month: JUL, amount: 100_000 })
    expect(res.ok).toBe(true)
    expect(await prisma.budget.count({ where: { userId, year: Y, month: JUL } })).toBe(1)
  })

  it('rechaza categoría de ingreso', async () => {
    const res = await upsertBudget({ categoryId: catIngreso, year: Y, month: JUL, amount: 100_000 })
    expect(res).toEqual({ ok: false, error: 'Categoría no válida' })
  })

  it('rechaza categoría ajena', async () => {
    const res = await upsertBudget({ categoryId: catAjena, year: Y, month: JUL, amount: 100_000 })
    expect(res).toEqual({ ok: false, error: 'Categoría no válida' })
  })

  it('rechaza amount <= 0 y month fuera de rango', async () => {
    expect((await upsertBudget({ categoryId: catGasto, year: Y, month: JUL, amount: 0 })).ok).toBe(false)
    expect((await upsertBudget({ categoryId: catGasto, year: Y, month: 12, amount: 100 })).ok).toBe(false)
  })

  it('deleteBudget valida el id con zod', async () => {
    expect(await deleteBudget(123)).toEqual({ ok: false, error: 'Datos inválidos' })
  })

  it('deleteBudget: id de otro usuario → no encontrado; propio → borra', async () => {
    const row = await prisma.budget.findFirst({ where: { userId, year: Y, month: JUL } })
    const ajeno = await prisma.budget.create({
      data: { userId: otherId, categoryId: catAjena, year: Y, month: JUL, amount: 1_000 },
    })
    expect((await deleteBudget(ajeno.id)).ok).toBe(false) // auth() devuelve userId, no otherId
    expect((await deleteBudget(row!.id)).ok).toBe(true)
    expect(await prisma.budget.count({ where: { id: row!.id } })).toBe(0)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/budget-actions.test.ts`
Expected: FAIL — `Cannot find module '@/lib/budget-actions'`.

- [ ] **Step 3: Implementar**

1. Añadir al FINAL de `lib/validators.ts`:

```ts
export const budgetSchema = z.object({
  categoryId: z.string().min(1, 'Categoría requerida'),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(0).max(11), // 0-11, convención JS Date
  amount: z.number().int().positive('El límite debe ser mayor que 0'),
})

export type BudgetFormValues = z.infer<typeof budgetSchema>

export const idSchema = z.string().min(1)
```

2. Crear `lib/budget-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { budgetSchema, idSchema } from '@/lib/validators'
import { upsertBudgetForUser, deleteBudgetForUser } from '@/lib/budgets'

function revalidate() {
  revalidatePath('/presupuesto')
  revalidatePath('/')
}

export async function upsertBudget(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsed = budgetSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  // la categoría debe existir, ser de gasto y visible para el usuario (propia o del sistema)
  const cat = await prisma.category.findFirst({
    where: {
      id: parsed.data.categoryId,
      kind: 'EXPENSE',
      OR: [{ userId: null }, { userId: session.user.id }],
    },
    select: { id: true },
  })
  if (!cat) return { ok: false as const, error: 'Categoría no válida' }

  try {
    await upsertBudgetForUser(session.user.id, parsed.data)
  } catch {
    return { ok: false as const, error: 'No se pudo guardar el presupuesto' }
  }
  revalidate()
  return { ok: true as const }
}

export async function deleteBudget(id: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false as const, error: 'Datos inválidos' }

  try {
    const res = await deleteBudgetForUser(session.user.id, parsedId.data)
    if (!res.ok) return { ok: false as const, error: 'Presupuesto no encontrado' }
  } catch {
    return { ok: false as const, error: 'No se pudo quitar el presupuesto' }
  }
  revalidate()
  return { ok: true as const }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/budget-actions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/validators.ts lib/budget-actions.ts tests/budget-actions.test.ts
git commit -m "feat: budgetSchema + actions upsertBudget/deleteBudget con zod en ids"
```

---

### Task 6: Componentes UI — `MonthNav`, `BudgetHero`, `BudgetCategoryRow`, `BudgetDialog`

**Files:**
- Create: `components/growly/month-nav.tsx`
- Create: `components/growly/budget-hero.tsx`
- Create: `components/growly/budget-category-row.tsx`
- Create: `components/growly/budget-dialog.tsx`
- Test: `tests/budget-components.test.tsx`
- Test: `tests/budget-dialog.test.tsx`

**Interfaces:**
- Consumes: `lib/month-param` (Task 3), `budget-actions` (Task 5), `<Money>`, `Dialog`/`Button`/`Input`/`Label` de `components/ui`.
- Produces (Task 7 depende de estas props exactas):
  - `MonthNav({ ym: YearMonth; basePath: string })`
  - `BudgetHero({ totals: BudgetTotals; forecast?: { projected: number; daysLeft: number } | null })`
  - `BudgetCategoryRow({ row: BudgetRowView; year: number; month: number })` con `type BudgetRowView = { budgetId: string; categoryId: string; name: string; colorHex: string; limit: number; spent: number; pct: number; over: boolean }`
  - `BudgetDialog({ year: number; month: number; categories: { id: string; name: string }[]; initial?: BudgetFormInitial; trigger?: React.ReactElement })` con `type BudgetFormInitial = { categoryId: string; categoryName: string; amountStr: string }` — sin `initial` es "Añadir categoría" (select), con `initial` es "Editar límite" (categoría fija).

- [ ] **Step 1: Escribir los tests**

Crear `tests/budget-components.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthNav } from '@/components/growly/month-nav'
import { BudgetHero } from '@/components/growly/budget-hero'
import { BudgetCategoryRow } from '@/components/growly/budget-category-row'

vi.mock('@/lib/budget-actions', () => ({
  upsertBudget: vi.fn(async () => ({ ok: true })),
  deleteBudget: vi.fn(async () => ({ ok: true })),
}))

describe('MonthNav', () => {
  it('muestra la etiqueta y enlaza mes anterior/siguiente cruzando el año', () => {
    render(<MonthNav ym={{ year: 2026, month: 0 }} basePath="/presupuesto" />)
    expect(screen.getByText('Enero 2026')).toBeInTheDocument()
    expect(screen.getByLabelText('Mes anterior')).toHaveAttribute('href', '/presupuesto?m=2025-12')
    expect(screen.getByLabelText('Mes siguiente')).toHaveAttribute('href', '/presupuesto?m=2026-02')
  })
})

describe('BudgetHero', () => {
  const totals = { limit: 450_000, spent: 388_000, pct: 86, available: 62_000 }

  it('muestra gastado, disponible, % y días restantes', () => {
    render(<BudgetHero totals={totals} forecast={{ projected: 434_000, daysLeft: 27 }} />)
    expect(screen.getByText('$3,880')).toBeInTheDocument()
    expect(screen.getByText('86% del presupuesto usado · quedan 27 días')).toBeInTheDocument()
    expect(screen.getByText(/A este ritmo/)).toBeInTheDocument()
  })

  it('sin forecast (mes no actual) no muestra la predicción', () => {
    render(<BudgetHero totals={totals} forecast={null} />)
    expect(screen.getByText('86% del presupuesto usado')).toBeInTheDocument()
    expect(screen.queryByText(/A este ritmo/)).not.toBeInTheDocument()
  })

  it('la barra se capa al 100%', () => {
    render(<BudgetHero totals={{ limit: 100_000, spent: 150_000, pct: 150, available: -50_000 }} forecast={null} />)
    expect(screen.getByTestId('budget-hero-bar')).toHaveStyle({ width: '100%' })
  })
})

describe('BudgetCategoryRow', () => {
  const base = {
    budgetId: 'b1', categoryId: 'c1', name: 'Alimentación', colorHex: '#3B82F6',
    limit: 100_000, spent: 93_000, pct: 93, over: false,
  }

  it('muestra nombre, gastado/límite y barra con el color de la categoría', () => {
    render(<BudgetCategoryRow row={base} year={2026} month={6} />)
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    const bar = screen.getByTestId('budget-row-bar')
    expect(bar).toHaveStyle({ width: '93%', backgroundColor: '#3B82F6' })
  })

  it('excedida: barra al 100% y en rojo #C9584F', () => {
    render(
      <BudgetCategoryRow
        row={{ ...base, spent: 120_000, pct: 120, over: true }}
        year={2026} month={6}
      />,
    )
    const bar = screen.getByTestId('budget-row-bar')
    expect(bar).toHaveStyle({ width: '100%', backgroundColor: '#C9584F' })
  })
})
```

Crear `tests/budget-dialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BudgetDialog } from '@/components/growly/budget-dialog'
import { upsertBudget } from '@/lib/budget-actions'

vi.mock('@/lib/budget-actions', () => ({
  upsertBudget: vi.fn(async () => ({ ok: true })),
}))

const categories = [
  { id: 'c1', name: 'Alimentación' },
  { id: 'c2', name: 'Transporte' },
]

beforeEach(() => vi.clearAllMocks())

describe('BudgetDialog', () => {
  it('alta: selecciona categoría, escribe importe y llama upsertBudget en centavos', async () => {
    const user = userEvent.setup()
    render(<BudgetDialog year={2026} month={6} categories={categories} />)
    await user.click(screen.getByRole('button', { name: /Añadir categoría/i }))
    await user.selectOptions(screen.getByLabelText('Categoría'), 'c2')
    await user.type(screen.getByLabelText('Límite mensual'), '450.50')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(upsertBudget).toHaveBeenCalledWith({
        categoryId: 'c2', year: 2026, month: 6, amount: 45_050,
      }),
    )
  })

  it('edición: categoría fija, importe precargado', async () => {
    const user = userEvent.setup()
    render(
      <BudgetDialog
        year={2026} month={6} categories={[]}
        initial={{ categoryId: 'c1', categoryName: 'Alimentación', amountStr: '1000.00' }}
        trigger={<button type="button">Editar</button>}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByText(/Editar límite · Alimentación/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Límite mensual')).toHaveValue('1000.00')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(upsertBudget).toHaveBeenCalledWith({
        categoryId: 'c1', year: 2026, month: 6, amount: 100_000,
      }),
    )
  })

  it('muestra el error de la action', async () => {
    vi.mocked(upsertBudget).mockResolvedValueOnce({ ok: false, error: 'Categoría no válida' })
    const user = userEvent.setup()
    render(<BudgetDialog year={2026} month={6} categories={categories} />)
    await user.click(screen.getByRole('button', { name: /Añadir categoría/i }))
    await user.type(screen.getByLabelText('Límite mensual'), '100')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Categoría no válida')).toBeInTheDocument()
  })

  it('rechaza importe inválido sin llamar a la action', async () => {
    const user = userEvent.setup()
    render(<BudgetDialog year={2026} month={6} categories={categories} />)
    await user.click(screen.getByRole('button', { name: /Añadir categoría/i }))
    await user.type(screen.getByLabelText('Límite mensual'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Importe no válido')).toBeInTheDocument()
    expect(upsertBudget).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/budget-components.test.tsx tests/budget-dialog.test.tsx`
Expected: FAIL — módulos de componentes inexistentes.

- [ ] **Step 3: Implementar los cuatro componentes**

Crear `components/growly/month-nav.tsx`:

```tsx
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
```

Crear `components/growly/budget-hero.tsx`:

```tsx
import { Money } from '@/components/growly/money'
import type { BudgetTotals } from '@/lib/budgets'

// El hero es oscuro (bg-forest) en ambos temas → colores fijos, como BalanceHero:
// verde #34d399 para la barra normal, rojos claros legibles sobre forest al exceder.
export function BudgetHero({
  totals, forecast,
}: {
  totals: BudgetTotals
  forecast?: { projected: number; daysLeft: number } | null
}) {
  const barPct = Math.min(totals.pct, 100)
  const overBudget = totals.pct > 100
  const overProjection = !!forecast && forecast.projected > totals.limit
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-forest p-6 text-white shadow-[0_18px_40px_-18px_rgba(18,33,28,.5)]">
      <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,.4),transparent_70%)]" />
      <div className="mb-2 text-sm text-white/60">
        Gastado de <Money cents={totals.limit} withCents={false} />
      </div>
      <div className="flex items-end justify-between gap-4">
        <Money cents={totals.spent} withCents={false} className="text-[42px] font-extrabold tracking-[-0.03em]" />
        <div className="pb-2 text-sm text-white/70">
          <b className="text-white"><Money cents={totals.available} signed withCents={false} /></b> disponible
        </div>
      </div>
      <div className="mt-4 h-2 rounded-full bg-white/15">
        <div
          data-testid="budget-hero-bar"
          className={`h-2 rounded-full ${overBudget ? 'bg-[#e0685e]' : 'bg-[#34d399]'}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <div className="mt-3 text-sm text-white/70">
        {totals.pct}% del presupuesto usado{forecast ? ` · quedan ${forecast.daysLeft} días` : ''}
      </div>
      {forecast && (
        <div className={`mt-1 text-sm font-bold ${overProjection ? 'text-[#ffb4ab]' : 'text-white/70'}`}>
          A este ritmo: ~<Money cents={forecast.projected} withCents={false} /> este mes
        </div>
      )}
    </div>
  )
}
```

Crear `components/growly/budget-dialog.tsx`:

```tsx
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
import { upsertBudget } from '@/lib/budget-actions'
import { parseAmountToCents } from '@/lib/money'

type CategoryOpt = { id: string; name: string }

export type BudgetFormInitial = { categoryId: string; categoryName: string; amountStr: string }

const selectCls = 'h-11 w-full rounded-md border border-input bg-field px-3 text-sm'

export function BudgetDialog({
  year, month, categories, initial, trigger,
}: {
  year: number
  month: number // 0-11
  categories: CategoryOpt[] // opciones seleccionables (EXPENSE sin presupuesto ese mes)
  initial?: BudgetFormInitial // modo edición: categoría fija
  trigger?: React.ReactElement
}) {
  const uid = React.useId()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const editing = !!initial

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    const amount = parseAmountToCents(String(fd.get('amount') ?? ''))
    if (!amount) {
      setError('Importe no válido')
      setLoading(false)
      return
    }
    const categoryId = editing ? initial.categoryId : String(fd.get('categoryId') ?? '')

    const res = await upsertBudget({ categoryId, year, month, amount })
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
        if (!o) setError(null)
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button className="h-9 font-extrabold">
              <Plus size={16} /> Añadir categoría
            </Button>
          )
        }
      />
      <DialogContent className="w-full max-w-[420px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">
          {editing ? `Editar límite · ${initial.categoryName}` : 'Añadir categoría'}
        </DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {!editing && (
            <div>
              <Label htmlFor={`${uid}-categoryId`}>Categoría</Label>
              <select id={`${uid}-categoryId`} name="categoryId" required className={selectCls}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <Label htmlFor={`${uid}-amount`}>Límite mensual</Label>
            <Input
              id={`${uid}-amount`}
              name="amount"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={initial?.amountStr}
              required
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
```

Crear `components/growly/budget-category-row.tsx`:

```tsx
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
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/budget-components.test.tsx tests/budget-dialog.test.tsx`
Expected: PASS (6 + 4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/growly/month-nav.tsx components/growly/budget-hero.tsx components/growly/budget-category-row.tsx components/growly/budget-dialog.tsx tests/budget-components.test.tsx tests/budget-dialog.test.tsx
git commit -m "feat: componentes de presupuesto (MonthNav, hero, fila de categoría, diálogo)"
```

---

### Task 7: Página `/presupuesto`

**Files:**
- Modify: `app/(app)/presupuesto/page.tsx` (hoy es un placeholder `ComingSoon` de 2 líneas — se reemplaza entero)
- Test: `tests/presupuesto-page.test.tsx`

**Interfaces:**
- Consumes: `getBudgetsForMonth`/`budgetProgress`/`budgetForecast` (Tasks 2/4), `parseMonthParam`/`isCurrentMonth` (Task 3), `getTransactionsForUser`, `getCategoriesForUser`, componentes de Task 6.
- Produces: página server component en `/presupuesto` con query param `?m=YYYY-MM`.

Notas de diseño:
- El forecast SOLO se muestra en el mes actual (`isCurrentMonth`) y con presupuesto no vacío.
- El diálogo de alta ofrece solo categorías `kind = EXPENSE` que aún no tienen presupuesto en el mes visto.
- Estado vacío (sin budgets en el mes visto): CTA "Crea tu primer presupuesto" + botón de alta.
- NO llama `materializeRecurringForUser`: el gasto del presupuesto solo cuenta CLEARED, los PENDING no afectan.

- [ ] **Step 1: Escribir los tests**

Crear `tests/presupuesto-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/budget-actions', () => ({
  upsertBudget: vi.fn(),
  deleteBudget: vi.fn(),
}))

const getBudgetsForMonth = vi.fn()
vi.mock('@/lib/budgets', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/budgets')>()
  return { ...real, getBudgetsForMonth: (...a: unknown[]) => getBudgetsForMonth(...a) }
})
vi.mock('@/lib/transactions', () => ({
  getTransactionsForUser: vi.fn(async () => [
    {
      type: 'EXPENSE', status: 'CLEARED', amount: 25_000,
      date: new Date(2026, 4, 10), categoryId: 'c1',
    },
  ]),
}))
vi.mock('@/lib/categories', () => ({
  getCategoriesForUser: vi.fn(async () => [
    { id: 'c1', name: 'Alimentación', colorHex: '#3B82F6', icon: 'utensils', kind: 'EXPENSE' },
    { id: 'c2', name: 'Transporte', colorHex: '#E0AD2E', icon: 'car', kind: 'EXPENSE' },
    { id: 'c3', name: 'Sueldo', colorHex: '#10B981', icon: 'trending-up', kind: 'INCOME' },
  ]),
}))

import PresupuestoPage from '@/app/(app)/presupuesto/page'

beforeEach(() => getBudgetsForMonth.mockReset())

describe('página /presupuesto', () => {
  it('con presupuesto: hero, fila de categoría y % usados (mayo 2026, sin forecast)', async () => {
    getBudgetsForMonth.mockResolvedValue([
      { id: 'b1', userId: 'u1', categoryId: 'c1', year: 2026, month: 4, amount: 100_000 },
    ])
    render(await PresupuestoPage({ searchParams: Promise.resolve({ m: '2026-05' }) }))
    expect(screen.getByText('Mayo 2026')).toBeInTheDocument()
    expect(screen.getByText(/Gastado de/)).toBeInTheDocument()
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    // 25_000 / 100_000 → 25%; mes no actual → sin "quedan N días" ni "A este ritmo"
    expect(screen.getByText('25% del presupuesto usado')).toBeInTheDocument()
    expect(screen.queryByText(/A este ritmo/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Añadir categoría/i })).toBeInTheDocument()
  })

  it('vacío: CTA de primer presupuesto', async () => {
    getBudgetsForMonth.mockResolvedValue([])
    render(await PresupuestoPage({ searchParams: Promise.resolve({ m: '2026-04' }) }))
    expect(screen.getByText(/Crea tu primer presupuesto/)).toBeInTheDocument()
    expect(screen.queryByText(/Gastado de/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/presupuesto-page.test.tsx`
Expected: FAIL — la página actual renderiza `ComingSoon` ("Presupuesto" placeholder), no hay hero ni CTA.

- [ ] **Step 3: Implementar la página**

Reemplazar TODO el contenido de `app/(app)/presupuesto/page.tsx`:

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getBudgetsForMonth, budgetProgress, budgetForecast } from '@/lib/budgets'
import { getTransactionsForUser } from '@/lib/transactions'
import { getCategoriesForUser } from '@/lib/categories'
import { parseMonthParam, isCurrentMonth } from '@/lib/month-param'
import { MonthNav } from '@/components/growly/month-nav'
import { BudgetHero } from '@/components/growly/budget-hero'
import { BudgetCategoryRow } from '@/components/growly/budget-category-row'
import { BudgetDialog } from '@/components/growly/budget-dialog'

export default async function PresupuestoPage({
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

  const [budgets, txns, categories] = await Promise.all([
    getBudgetsForMonth(userId, ym.year, ym.month, now),
    getTransactionsForUser(userId),
    getCategoriesForUser(userId),
  ])
  const catById = new Map(categories.map((c) => [c.id, c]))
  const { categories: rows, totals } = budgetProgress(budgets, txns, ym.year, ym.month)
  const forecast =
    isCurrentMonth(ym, now) && budgets.length > 0 ? budgetForecast(totals, now) : null

  const budgetedIds = new Set(budgets.map((b) => b.categoryId))
  const available = categories
    .filter((c) => c.kind === 'EXPENSE' && !budgetedIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Presupuesto</h1>
        <MonthNav ym={ym} basePath="/presupuesto" />
      </div>

      {budgets.length === 0 ? (
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <p className="mb-4 text-sm text-muted-foreground">
            Crea tu primer presupuesto: pon un límite mensual a tus categorías de gasto.
          </p>
          <div className="flex justify-center">
            <BudgetDialog year={ym.year} month={ym.month} categories={available} />
          </div>
        </div>
      ) : (
        <>
          <BudgetHero totals={totals} forecast={forecast} />
          <div className="rounded-[22px] border border-border bg-card px-5 pb-1 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between pt-4">
              <div className="text-base font-extrabold text-foreground">Por categoría</div>
              <BudgetDialog year={ym.year} month={ym.month} categories={available} />
            </div>
            <div className="divide-y divide-[var(--line)]">
              {rows.map((r) => {
                const cat = catById.get(r.categoryId)
                return (
                  <BudgetCategoryRow
                    key={r.budgetId}
                    year={ym.year}
                    month={ym.month}
                    row={{
                      budgetId: r.budgetId,
                      categoryId: r.categoryId,
                      name: cat?.name ?? 'Categoría',
                      colorHex: cat?.colorHex ?? '#8A857E',
                      limit: r.limit,
                      spent: r.spent,
                      pct: r.pct,
                      over: r.over,
                    }}
                  />
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verificar que pasan (y lint)**

Run: `npx vitest run tests/presupuesto-page.test.tsx`
Expected: PASS (2 tests).

Run: `npm run lint`
Expected: sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/presupuesto/page.tsx" tests/presupuesto-page.test.tsx
git commit -m "feat: página /presupuesto con selector de mes, hero y categorías"
```

---

### Task 8: Dashboard — resumen en `getDashboardData` + `BudgetCard`

**Files:**
- Create: `components/growly/budget-card.tsx`
- Modify: `lib/dashboard.ts` (función `getDashboardData`)
- Modify: `app/(app)/page.tsx` (fila de cards)
- Test: `tests/budget-card.test.tsx`
- Test: Modify `tests/dashboard.test.ts` (añadir un describe al final)

**Interfaces:**
- Consumes: `getBudgetsForMonth` + `budgetProgress` (Tasks 2/4).
- Produces:
  - `type BudgetSummary = { totals: { limit: number; spent: number; pct: number }; top: { categoryId: string; name: string; colorHex: string; pct: number; over: boolean }[] }` en `budget-card.tsx`.
  - `BudgetCard({ summary: BudgetSummary | null })`.
  - `getDashboardData` devuelve además `budget: BudgetSummary | null` (null si el mes actual no tiene budgets tras la auto-copia).

- [ ] **Step 1: Escribir los tests del card**

Crear `tests/budget-card.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetCard } from '@/components/growly/budget-card'

const summary = {
  totals: { limit: 450_000, spent: 388_000, pct: 86 },
  top: [
    { categoryId: 'c1', name: 'Alimentación', colorHex: '#3B82F6', pct: 93, over: false },
    { categoryId: 'c2', name: 'Transporte', colorHex: '#E0AD2E', pct: 120, over: true },
    { categoryId: 'c3', name: 'Casa', colorHex: '#10B981', pct: 40, over: false },
  ],
}

describe('BudgetCard', () => {
  it('muestra totales, badge de % y top categorías', () => {
    render(<BudgetCard summary={summary} />)
    expect(screen.getByText('Presupuesto')).toBeInTheDocument()
    expect(screen.getByText('86%')).toBeInTheDocument()
    expect(screen.getByText('$3,880')).toBeInTheDocument()
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    expect(screen.getByText('120%')).toBeInTheDocument()
  })

  it('badge ámbar en 85-100, verde debajo, rojo por encima', () => {
    const { rerender } = render(<BudgetCard summary={summary} />)
    expect(screen.getByText('86%').className).toContain('text-warning')
    rerender(<BudgetCard summary={{ ...summary, totals: { ...summary.totals, pct: 45 } }} />)
    expect(screen.getByText('45%').className).toContain('text-acc')
    rerender(<BudgetCard summary={{ ...summary, totals: { ...summary.totals, pct: 120 } }} />)
    expect(screen.getByText('120%', { selector: 'span.rounded-full' }).className).toContain('text-destructive')
  })

  it('categoría excedida en rojo #C9584F', () => {
    render(<BudgetCard summary={summary} />)
    expect(screen.getByText('120%')).toHaveStyle({ color: '#C9584F' })
  })

  it('sin presupuesto: estado vacío con link a /presupuesto', () => {
    render(<BudgetCard summary={null} />)
    expect(screen.getByText(/Sin presupuesto este mes/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Crear presupuesto/i })).toHaveAttribute('href', '/presupuesto')
  })
})
```

Nota del segundo test: cuando el badge y una categoría del top comparten texto (p. ej. `120%`), desambigua con `selector` como en el ejemplo.

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/budget-card.test.tsx`
Expected: FAIL — `Cannot find module '@/components/growly/budget-card'`.

- [ ] **Step 3: Implementar `BudgetCard`**

Crear `components/growly/budget-card.tsx`:

```tsx
import Link from 'next/link'
import { Money } from '@/components/growly/money'

const OVER = '#C9584F'

export type BudgetSummary = {
  totals: { limit: number; spent: number; pct: number }
  top: { categoryId: string; name: string; colorHex: string; pct: number; over: boolean }[]
}

export function BudgetCard({ summary }: { summary: BudgetSummary | null }) {
  if (!summary) {
    return (
      <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-2 text-base font-extrabold text-foreground">Presupuesto</div>
        <p className="text-sm text-muted-foreground">
          Sin presupuesto este mes.{' '}
          <Link href="/presupuesto" className="font-bold text-acc underline-offset-2 hover:underline">
            Crear presupuesto
          </Link>
        </p>
      </div>
    )
  }

  const { totals, top } = summary
  const tone =
    totals.pct > 100
      ? 'bg-destructive/15 text-destructive'
      : totals.pct >= 85
        ? 'bg-warning/15 text-warning'
        : 'bg-acc/15 text-acc'

  return (
    <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-base font-extrabold text-foreground">Presupuesto</div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${tone}`}>
          {totals.pct}%
        </span>
      </div>
      <div className="text-sm text-muted-foreground">
        <b className="text-foreground">
          <Money cents={totals.spent} withCents={false} />
        </b>{' '}
        / <Money cents={totals.limit} withCents={false} />
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted">
        <div
          data-testid="budget-card-bar"
          className={`h-2 rounded-full ${totals.pct > 100 ? 'bg-destructive' : 'bg-acc'}`}
          style={{ width: `${Math.min(totals.pct, 100)}%` }}
        />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {top.map((c) => (
          <div key={c.categoryId} className="flex items-center gap-2 text-sm">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.colorHex }} />
            <span className="min-w-0 flex-1 truncate font-bold text-foreground">{c.name}</span>
            <span className="font-extrabold text-foreground" style={c.over ? { color: OVER } : undefined}>
              {c.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Run: `npx vitest run tests/budget-card.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 4: Ampliar `getDashboardData` con test**

1. Añadir al FINAL de `tests/dashboard.test.ts` (es un archivo existente; añadir imports arriba solo si faltan):

```ts
import { getDashboardData } from '@/lib/dashboard'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('getDashboardData · budget', () => {
  const email = `dashbud_${Date.now()}@growly.app`
  let uid = ''
  let accId = ''
  let catId = ''
  const now = new Date()

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'DashBud', email } })
    uid = u.id
    accId = (await prisma.account.create({ data: { userId: uid, name: 'C', type: 'CHECKING' } })).id
    catId = (await prisma.category.create({ data: { userId: uid, name: 'DashComida', kind: 'EXPENSE', colorHex: '#3B82F6' } })).id
  })
  afterAll(async () => {
    await prisma.budget.deleteMany({ where: { userId: uid } })
    await prisma.transaction.deleteMany({ where: { userId: uid } })
    await prisma.category.deleteMany({ where: { userId: uid } })
    await prisma.account.deleteMany({ where: { userId: uid } })
    await prisma.user.delete({ where: { id: uid } })
  })

  it('sin budgets devuelve budget: null', async () => {
    const d = await getDashboardData(uid, now)
    expect(d.budget).toBeNull()
  })

  it('con budget devuelve totales y top con nombre/color de la categoría', async () => {
    await prisma.budget.create({
      data: { userId: uid, categoryId: catId, year: now.getFullYear(), month: now.getMonth(), amount: 100_000 },
    })
    await prisma.transaction.create({
      data: {
        userId: uid, accountId: accId, categoryId: catId, type: 'EXPENSE',
        amount: 25_000, description: 'Súper', date: now, status: 'CLEARED',
      },
    })
    const d = await getDashboardData(uid, now)
    expect(d.budget).not.toBeNull()
    expect(d.budget!.totals).toMatchObject({ limit: 100_000, spent: 25_000, pct: 25 })
    expect(d.budget!.top[0]).toMatchObject({ name: 'DashComida', colorHex: '#3B82F6', pct: 25, over: false })
  })
})
```

(`describe`/`beforeAll`/`afterAll`/`it`/`expect` ya están importados de vitest en ese archivo; `getDashboardData` y `prisma` puede que también — comprobar y no duplicar imports.)

Run: `npx vitest run tests/dashboard.test.ts`
Expected: FAIL — `d.budget` es `undefined`.

2. En `lib/dashboard.ts`:

Añadir el import junto a los existentes (van al final del archivo, antes de `getDashboardData`):

```ts
import { getBudgetsForMonth, budgetProgress } from '@/lib/budgets'
```

Reemplazar en `getDashboardData` el bloque del `Promise.all`:

```ts
  const [{ accounts }, txns, categories, budgets] = await Promise.all([
    getAccountsWithBalances(userId),
    getTransactionsForUser(userId),
    getCategoriesForUser(userId),
    getBudgetsForMonth(userId, now.getFullYear(), now.getMonth(), now),
  ])
```

Y añadir antes del `return`:

```ts
  const catById = new Map(categories.map((c) => [c.id, c]))
  const progress = budgetProgress(budgets, txns, now.getFullYear(), now.getMonth())
  const budget =
    budgets.length === 0
      ? null
      : {
          totals: {
            limit: progress.totals.limit,
            spent: progress.totals.spent,
            pct: progress.totals.pct,
          },
          top: progress.categories.slice(0, 3).map((c) => ({
            categoryId: c.categoryId,
            name: catById.get(c.categoryId)?.name ?? 'Otros',
            colorHex: catById.get(c.categoryId)?.colorHex ?? '#8A857E',
            pct: c.pct,
            over: c.over,
          })),
        }
```

Y en el objeto del `return`, añadir la clave:

```ts
    budget,
```

Run: `npx vitest run tests/dashboard.test.ts`
Expected: PASS (los existentes + 2 nuevos).

- [ ] **Step 5: Colocar el card en el dashboard**

En `app/(app)/page.tsx`:

1. Añadir el import:

```tsx
import { BudgetCard } from '@/components/growly/budget-card'
```

2. Reemplazar la fila de dos columnas (el `div` con `className="grid gap-4 md:grid-cols-2"` que contiene `<CategoryDonut …/>` y el card "Próximos pagos") por una fila de tres columnas — el contenido del card "Próximos pagos" queda idéntico, solo cambia el grid y se añade el BudgetCard delante:

```tsx
      <div className="grid gap-4 md:grid-cols-3">
        <BudgetCard summary={d.budget} />

        <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="mb-4 text-base font-extrabold text-foreground">Próximos pagos</div>
          {d.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay pagos próximos.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--line)]">
              {d.upcoming.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-3">
                  <span className="text-sm font-bold text-foreground">{t.description}</span>
                  <Money cents={t.amount} className="text-sm font-extrabold" />
                </div>
              ))}
            </div>
          )}
        </div>

        <CategoryDonut breakdown={d.breakdown} />
      </div>
```

(En C3 esta fila pasará a ser Presupuesto | Próximos pagos | Metas según el diseño web; el donut se recolocará entonces.)

Run: `npm run lint`
Expected: sin errores nuevos.

Run: `npx vitest run`
Expected: TODA la suite verde (los ~117 previos + los nuevos de C2).

- [ ] **Step 6: Commit**

```bash
git add components/growly/budget-card.tsx lib/dashboard.ts "app/(app)/page.tsx" tests/budget-card.test.tsx tests/dashboard.test.ts
git commit -m "feat: card de presupuesto en el dashboard con resumen en getDashboardData"
```

---

### Task 9: e2e — crear presupuesto, ver progreso con un gasto y card del dashboard

**Files:**
- Test: `tests/e2e/presupuesto.spec.ts`

**Interfaces:**
- Consumes: flujo completo de las Tasks 1-8 más el registro/cuentas/movimientos existentes. Usa la categoría del sistema `Alimentación` (seed).

- [ ] **Step 1: Escribir el e2e**

Crear `tests/e2e/presupuesto.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('presupuesto: crear límite, ver progreso con un gasto y card del dashboard', async ({ page }) => {
  const email = `e2e_pre_${Date.now()}@growly.app`
  // fecha local de hoy en formato del input date.
  // Nota: al inicio de mes con offset UTC negativo el gasto podría caer en el mes
  // anterior por la convención de fechas pendiente de unificar (backlog pre-C4).
  const now = new Date()
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // registro
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Pre')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // cuenta para el gasto
  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  // estado vacío → crear presupuesto de Alimentación $1,000
  await page.goto('/presupuesto')
  await expect(page.getByText(/Crea tu primer presupuesto/)).toBeVisible()
  await page.getByRole('button', { name: /Añadir categoría/i }).click()
  await page.getByLabel('Categoría').selectOption({ label: 'Alimentación' })
  await page.getByLabel('Límite mensual').fill('1000')
  await page.getByRole('button', { name: 'Guardar' }).click()

  // hero y fila de la categoría visibles
  await expect(page.getByText(/Gastado de/)).toBeVisible()
  await expect(page.getByText('Alimentación')).toBeVisible()
  await expect(page.getByText('0% del presupuesto usado', { exact: false })).toBeVisible()

  // gasto de $250 en Alimentación hoy (CLEARED)
  await page.goto('/movimientos')
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByLabel('Importe').fill('250')
  await page.getByLabel('Descripción').fill('Súper')
  await page.getByLabel('Categoría').selectOption({ label: 'Alimentación' })
  await page.getByLabel('Fecha').fill(hoy)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Súper')).toBeVisible()

  // /presupuesto refleja el gasto: 250/1000 = 25%
  await page.goto('/presupuesto')
  await expect(page.getByText(/25% del presupuesto usado/)).toBeVisible()

  // el dashboard muestra el card con el badge del 25%
  await page.goto('/')
  await expect(page.getByText('25%').first()).toBeVisible()
})
```

- [ ] **Step 2: Ejecutarlo y verificar que pasa**

Run: `npx playwright test tests/e2e/presupuesto.spec.ts`
Expected: PASS (Playwright levanta `next dev` solo; requiere `.env` local con `DATABASE_URL` y seed aplicado).

Si falla, depurar con `npx playwright test tests/e2e/presupuesto.spec.ts --trace on` y corregir la página/componentes (NO el test, salvo error del propio test).

- [ ] **Step 3: Suite completa**

Run: `npx vitest run`
Expected: toda la suite unit verde.

Run: `npx playwright test`
Expected: los 6 e2e verdes (5 previos + este).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/presupuesto.spec.ts
git commit -m "test: e2e de presupuesto — límite, progreso con gasto y card del dashboard"
```

---

## Spec coverage (self-review)

- §4 modelo `Budget` + relaciones inversas → Task 1.
- §6.1 `getBudgetsForMonth` + auto-copia + caso borde documentado → Task 4. `upsertBudgetForUser`/`deleteBudgetForUser` → Task 4. `budgetProgress`/`budgetForecast` (EXPENSE CLEARED, consistente con KPIs) → Task 2.
- §6.2 página: selector de mes `?m=` 1-12 con conversión en un solo sitio (Task 3 + MonthNav Task 6), hero con barra/%/días/predicción en rojo si excede (Task 6 BudgetHero), tarjetas por categoría con excedido `#C9584F` al 100% (Task 6 BudgetCategoryRow), editar/quitar por fila y "Añadir categoría" con select de EXPENSE sin presupuesto (Tasks 6-7), solo EXPENSE + estado vacío (Task 7).
- §6.3 card dashboard: badge verde/ámbar/rojo (85/100), `$X / $Y`, barra, top-3 por % con excedida en rojo, estado vacío con link, `getDashboardData` con resumen → Task 8.
- §10 testing presupuesto: progress normal/excedido/sin gasto/ignora PENDING y otros meses (Task 2), forecast run-rate y día 1 (Task 2), auto-copia: copia/no re-copia/mes pasado no copia (Task 4), actions auth+ownership (Task 5), e2e crear presupuesto → hero y categoría visibles (Task 9, ampliado con gasto y card).
- §11 ejecución: rama `feature/fase-2-c2`, una migración (Task 1), review final de rama antes del merge (lo orquesta la skill de ejecución).
- Backlog C1 aplicado a lo nuevo: ids por Zod en `deleteBudget` (Task 5); `useId` en el diálogo (Task 6).
