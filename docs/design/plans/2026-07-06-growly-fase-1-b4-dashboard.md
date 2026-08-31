# Growly Fase 1 · B4: Dashboard · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el placeholder de "Inicio" por el dashboard real: saldo disponible, KPIs del mes (ingresos/gastos/ahorro), donut de gastos por categoría, próximos pagos y movimientos recientes, todo derivado de los datos de B2/B3, cerrando el MVP núcleo de la Fase 1.

**Architecture:** Agregaciones puras en `lib/dashboard.ts` (testeables sin DB) + un `getDashboardData(userId, now)` que reúne cuentas (con saldos de B2), movimientos y categorías (B3) y computa todo de una. Componentes de presentación (`BalanceHero`, `KpiCard`, `CategoryDonut`) + la página `/` como Server Component. Reutiliza `Money`/`SignedAmount` (B1) y `TransactionRow` (B3).

**Tech Stack:** Next.js 16 (Server Components), Prisma 6, Auth.js v5, Vitest + RTL, Playwright.

## Global Constraints

- **Dinero = `Int` centavos**; formateo vía `@/lib/money`. El signo solo en display.
- **Saldos ya excluyen `PENDING`** (B1). En el dashboard: **total** = suma de saldos de cuentas no-tarjeta (cleared); **comprometido** = suma de próximos pagos PENDING (gastos futuros); **disponible** = total − comprometido.
- **Mes actual** para KPIs/donut; sólo movimientos **CLEARED** cuentan para ingresos/gastos del mes.
- **Multi-tenant:** todo por `userId` de `auth()`.
- **Agregaciones puras** sin `Date.now()`/`new Date()` internos; el `now` se pasa como parámetro (la página lo inyecta con `new Date()`).
- **UI español**, formato `en-US`, tokens del design system (hero `bg-forest`, `text-acc`, etc.).
- **`.env` local/gitignored**: nunca tocar. Convención de tests de DB (email único por archivo, limpiar por `userId`). Commits `feat:`/`test:`.

---

## Estructura de archivos (B4)

```
lib/
└─ dashboard.ts          (CREAR) monthlyTotals · categoryBreakdown · upcomingPayments · recentTransactions · getDashboardData
components/growly/
├─ balance-hero.tsx      (CREAR) tarjeta oscura: disponible / total / comprometido
├─ kpi-card.tsx          (CREAR) tarjeta KPI (ingresos/gastos/ahorro)
└─ category-donut.tsx    (CREAR) donut conic-gradient + leyenda
app/(app)/
└─ page.tsx              (REEMPLAZAR el placeholder) dashboard real
tests/
├─ dashboard.test.ts
├─ dashboard-components.test.tsx
└─ e2e/dashboard.spec.ts
```

---

### Task 1: `lib/dashboard.ts`, agregaciones puras

**Files:**
- Create: `lib/dashboard.ts`
- Test: `tests/dashboard.test.ts`

**Interfaces:**
- Consumes: nada (funciones puras sobre objetos planos).
- Produces:
  - `type DashTx = { type: 'INCOME'|'EXPENSE'|'TRANSFER'; amount: number; date: Date; categoryId?: string|null; status?: 'CLEARED'|'PENDING' }`
  - `monthlyTotals(txns: DashTx[], year: number, month: number): { income: number; expense: number; savings: number; savingsRate: number }`: sólo CLEARED del mes; `savings = income − expense`; `savingsRate = income>0 ? round(savings/income*100): 0`.
  - `categoryBreakdown(txns: DashTx[], categories: { id: string; name: string; colorHex: string }[], year: number, month: number): { id: string; name: string; colorHex: string; total: number }[]`: gastos CLEARED del mes agrupados por `categoryId`, unidos a nombre/color (sin categoría → `{ id:'none', name:'Otros', colorHex:'#8A857E' }`), orden desc por total.
  - `upcomingPayments<T extends { date: Date; status?: 'CLEARED'|'PENDING' }>(txns: T[], now: Date, limit?: number): T[]`: `status==='PENDING'` y `date >= now`, orden asc por fecha, `limit` (default 3).
  - `recentTransactions<T extends { date: Date }>(txns: T[], limit?: number): T[]`: orden desc por fecha, primeros `limit` (default 5).

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/dashboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  monthlyTotals, categoryBreakdown, upcomingPayments, recentTransactions,
  type DashTx,
} from '@/lib/dashboard'

const cats = [
  { id: 'c1', name: 'Comida', colorHex: '#3B82F6' },
  { id: 'c2', name: 'Vivienda', colorHex: '#10B981' },
]

describe('monthlyTotals', () => {
  it('suma ingresos/gastos CLEARED del mes y calcula ahorro/tasa', () => {
    const txns: DashTx[] = [
      { type: 'INCOME', amount: 300000, date: new Date('2026-07-04'), status: 'CLEARED' },
      { type: 'EXPENSE', amount: 90000, date: new Date('2026-07-05'), status: 'CLEARED' },
      { type: 'EXPENSE', amount: 50000, date: new Date('2026-07-20'), status: 'PENDING' }, // ignorado
      { type: 'INCOME', amount: 100000, date: new Date('2026-06-30'), status: 'CLEARED' }, // otro mes
    ]
    expect(monthlyTotals(txns, 2026, 6)).toEqual({
      income: 300000, expense: 90000, savings: 210000, savingsRate: 70,
    })
  })
})

describe('categoryBreakdown', () => {
  it('agrupa gastos del mes por categoría, orden desc', () => {
    const txns: DashTx[] = [
      { type: 'EXPENSE', amount: 90000, date: new Date('2026-07-05'), categoryId: 'c1', status: 'CLEARED' },
      { type: 'EXPENSE', amount: 160000, date: new Date('2026-07-06'), categoryId: 'c2', status: 'CLEARED' },
      { type: 'EXPENSE', amount: 5000, date: new Date('2026-07-07'), categoryId: null, status: 'CLEARED' },
    ]
    const b = categoryBreakdown(txns, cats, 2026, 6)
    expect(b.map((x) => [x.name, x.total])).toEqual([
      ['Vivienda', 160000], ['Comida', 90000], ['Otros', 5000],
    ])
  })
})

describe('upcomingPayments / recentTransactions', () => {
  const now = new Date('2026-07-06T12:00:00Z')
  const txns = [
    { id: 'a', date: new Date('2026-07-10'), status: 'PENDING' as const },
    { id: 'b', date: new Date('2026-07-08'), status: 'PENDING' as const },
    { id: 'c', date: new Date('2026-07-01'), status: 'CLEARED' as const },
    { id: 'd', date: new Date('2026-07-05'), status: 'PENDING' as const }, // pasado → no upcoming
  ]
  it('upcoming: PENDING futuros, orden asc', () => {
    expect(upcomingPayments(txns, now).map((t) => t.id)).toEqual(['b', 'a'])
  })
  it('recent: orden desc por fecha', () => {
    expect(recentTransactions(txns, 2).map((t) => t.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/dashboard.test.ts`
Expected: FAIL (`Cannot find module '@/lib/dashboard'`).

- [ ] **Step 3: Implementar `lib/dashboard.ts`** (parte pura; `getDashboardData` se añade en Task 2)

```ts
export type DashTx = {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  amount: number
  date: Date
  categoryId?: string | null
  status?: 'CLEARED' | 'PENDING'
}

const inMonth = (d: Date, year: number, month: number) =>
  d.getFullYear() === year && d.getMonth() === month
const isCleared = (t: { status?: string }) => t.status !== 'PENDING'

export function monthlyTotals(txns: DashTx[], year: number, month: number) {
  let income = 0
  let expense = 0
  for (const t of txns) {
    if (!isCleared(t) || !inMonth(t.date, year, month)) continue
    if (t.type === 'INCOME') income += t.amount
    else if (t.type === 'EXPENSE') expense += t.amount
  }
  const savings = income - expense
  const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0
  return { income, expense, savings, savingsRate }
}

export function categoryBreakdown(
  txns: DashTx[],
  categories: { id: string; name: string; colorHex: string }[],
  year: number,
  month: number,
) {
  const catById = new Map(categories.map((c) => [c.id, c]))
  const totals = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'EXPENSE' || !isCleared(t) || !inMonth(t.date, year, month)) continue
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

export function upcomingPayments<T extends { date: Date; status?: 'CLEARED' | 'PENDING' }>(
  txns: T[],
  now: Date,
  limit = 3,
): T[] {
  return txns
    .filter((t) => t.status === 'PENDING' && t.date.getTime() >= now.getTime())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, limit)
}

export function recentTransactions<T extends { date: Date }>(txns: T[], limit = 5): T[] {
  return [...txns].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, limit)
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/dashboard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard.ts tests/dashboard.test.ts
git commit -m "feat: lib/dashboard — agregaciones del dashboard (totales, categorías, próximos, recientes)"
```

---

### Task 2: `getDashboardData(userId, now)`, integración

**Files:**
- Modify: `lib/dashboard.ts`
- Test: `tests/dashboard.test.ts` (añadir un describe de DB)

**Interfaces:**
- Consumes: `getAccountsWithBalances` de `@/lib/accounts` (B2); `getTransactionsForUser` de `@/lib/transactions` (B3); `getCategoriesForUser` de `@/lib/categories` (B3); las funciones puras de Task 1.
- Produces: `getDashboardData(userId: string, now: Date): Promise<{ total, comprometido, disponible, monthly, breakdown, upcoming, recent, categories }>` donde `total` = suma de saldos de cuentas no-tarjeta; `comprometido` = suma de importes de próximos pagos PENDING de tipo EXPENSE; `disponible = total − comprometido`; `monthly` = `monthlyTotals`; `breakdown` = `categoryBreakdown`; `upcoming` = `upcomingPayments`; `recent` = `recentTransactions`; `categories` = las del usuario.

- [ ] **Step 1: Escribir el test (debe fallar)**

Añade a `tests/dashboard.test.ts` (importa `getDashboardData`):

```ts
import { prisma } from '@/lib/prisma'
import { getDashboardData } from '@/lib/dashboard'
import { beforeAll, afterAll } from 'vitest'

describe.skipIf(!process.env.DATABASE_URL)('getDashboardData', () => {
  const email = `dash_${Date.now()}@growly.app`
  const now = new Date('2026-07-06T12:00:00Z')
  let userId = ''
  let accountId = ''
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Dash', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 1000000 } })
    accountId = a.id
    await prisma.transaction.createMany({
      data: [
        { userId, accountId, type: 'INCOME', amount: 300000, description: 'Nómina', date: new Date('2026-07-04'), status: 'CLEARED' },
        { userId, accountId, type: 'EXPENSE', amount: 90000, description: 'Súper', date: new Date('2026-07-05'), status: 'CLEARED' },
        { userId, accountId, type: 'EXPENSE', amount: 50000, description: 'Alquiler', date: new Date('2026-07-20'), status: 'PENDING' },
      ],
    })
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('reúne totales, disponible/comprometido y KPIs del mes', async () => {
    const d = await getDashboardData(userId, now)
    // saldo cleared = 1,000,000 + 300,000 - 90,000 = 1,210,000
    expect(d.total).toBe(1210000)
    expect(d.comprometido).toBe(50000) // pago pendiente futuro
    expect(d.disponible).toBe(1210000 - 50000)
    expect(d.monthly).toEqual({ income: 300000, expense: 90000, savings: 210000, savingsRate: 70 })
    expect(d.upcoming.length).toBe(1)
    expect(d.recent.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/dashboard.test.ts`
Expected: FAIL (`getDashboardData is not a function`).

- [ ] **Step 3: Implementar `getDashboardData` en `lib/dashboard.ts`**

Añade al final (mantén las funciones puras):

```ts
import { getAccountsWithBalances } from '@/lib/accounts'
import { getTransactionsForUser } from '@/lib/transactions'
import { getCategoriesForUser } from '@/lib/categories'

export async function getDashboardData(userId: string, now: Date) {
  const [{ accounts }, txns, categories] = await Promise.all([
    getAccountsWithBalances(userId),
    getTransactionsForUser(userId),
    getCategoriesForUser(userId),
  ])

  const total = accounts
    .filter((a) => a.type !== 'CREDIT_CARD')
    .reduce((s, a) => s + a.balance, 0)

  const upcoming = upcomingPayments(txns, now)
  const comprometido = upcoming
    .filter((t) => t.type === 'EXPENSE')
    .reduce((s, t) => s + t.amount, 0)

  return {
    total,
    comprometido,
    disponible: total - comprometido,
    monthly: monthlyTotals(txns, now.getFullYear(), now.getMonth()),
    breakdown: categoryBreakdown(
      txns,
      categories.map((c) => ({ id: c.id, name: c.name, colorHex: c.colorHex })),
      now.getFullYear(),
      now.getMonth(),
    ),
    upcoming,
    recent: recentTransactions(txns, 5),
    categories,
  }
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/dashboard.test.ts`
Expected: PASS (parte pura + DB).

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard.ts tests/dashboard.test.ts
git commit -m "feat: getDashboardData — reúne saldos, KPIs, categorías y próximos pagos"
```

---

### Task 3: Componentes, `BalanceHero`, `KpiCard`, `CategoryDonut`

**Files:**
- Create: `components/growly/balance-hero.tsx`, `components/growly/kpi-card.tsx`, `components/growly/category-donut.tsx`
- Test: `tests/dashboard-components.test.tsx`

**Interfaces:**
- Consumes: `Money` de `@/components/growly/money`; `formatMoney` de `@/lib/money`; `cn`; `lucide-react`.
- Produces:
  - `<BalanceHero disponible={number} total={number} comprometido={number} />`: tarjeta `bg-forest`: "Saldo disponible" grande + "Total" + "Comprometido".
  - `<KpiCard label={string} cents={number} accent?={'income'|'expense'|'neutral'} subtitle?={string} />`: tarjeta con etiqueta, importe (`<Money>`) y subtítulo.
  - `<CategoryDonut breakdown={{ id:string; name:string; colorHex:string; total:number }[]} />`: donut conic-gradient con leyenda; centro muestra el total gastado. Estado vacío si `breakdown` está vacío.

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/dashboard-components.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BalanceHero } from '@/components/growly/balance-hero'
import { KpiCard } from '@/components/growly/kpi-card'
import { CategoryDonut } from '@/components/growly/category-donut'

describe('<BalanceHero>', () => {
  it('muestra disponible, total y comprometido', () => {
    render(<BalanceHero disponible={1824000} total={2458000} comprometido={634000} />)
    expect(screen.getByText('Saldo disponible')).toBeInTheDocument()
    expect(screen.getByText('$18,240.00')).toBeInTheDocument()
    expect(screen.getByText('$24,580.00')).toBeInTheDocument()
    expect(screen.getByText('$6,340.00')).toBeInTheDocument()
  })
})

describe('<KpiCard>', () => {
  it('muestra etiqueta e importe', () => {
    render(<KpiCard label="Ingresos" cents={612000} accent="income" subtitle="▲ 8% vs jun" />)
    expect(screen.getByText('Ingresos')).toBeInTheDocument()
    expect(screen.getByText('$6,120.00')).toBeInTheDocument()
    expect(screen.getByText('▲ 8% vs jun')).toBeInTheDocument()
  })
})

describe('<CategoryDonut>', () => {
  it('lista las categorías con su importe', () => {
    render(<CategoryDonut breakdown={[
      { id: 'c1', name: 'Vivienda', colorHex: '#10B981', total: 163000 },
      { id: 'c2', name: 'Comida', colorHex: '#3B82F6', total: 93000 },
    ]} />)
    expect(screen.getByText('Vivienda')).toBeInTheDocument()
    expect(screen.getByText('$1,630.00')).toBeInTheDocument()
    expect(screen.getByText('Comida')).toBeInTheDocument()
  })
  it('muestra estado vacío sin datos', () => {
    render(<CategoryDonut breakdown={[]} />)
    expect(screen.getByText(/Sin gastos/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/dashboard-components.test.tsx`
Expected: FAIL (módulos no existen).

- [ ] **Step 3: Implementar los componentes**

Create `components/growly/balance-hero.tsx`:

```tsx
import { Money } from '@/components/growly/money'

export function BalanceHero({
  disponible, total, comprometido,
}: {
  disponible: number
  total: number
  comprometido: number
}) {
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-forest p-6 text-white shadow-[0_18px_40px_-18px_rgba(18,33,28,.5)]">
      <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,.4),transparent_70%)]" />
      <div className="mb-2 text-sm text-white/60">Saldo disponible</div>
      <Money cents={disponible} className="text-[42px] font-extrabold tracking-[-0.03em]" />
      <div className="mt-3 flex gap-4 text-sm text-white/70">
        <span>Total <b className="text-white"><Money cents={total} /></b></span>
        <span>Comprometido <b className="text-white"><Money cents={comprometido} /></b></span>
      </div>
    </div>
  )
}
```

Create `components/growly/kpi-card.tsx`:

```tsx
import { Money } from '@/components/growly/money'
import { cn } from '@/lib/utils'

export function KpiCard({
  label, cents, accent = 'neutral', subtitle,
}: {
  label: string
  cents: number
  accent?: 'income' | 'expense' | 'neutral'
  subtitle?: string
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
      <Money cents={cents} className="text-2xl font-extrabold text-foreground" />
      {subtitle && <div className="mt-1 text-xs font-bold text-acc">{subtitle}</div>}
    </div>
  )
}
```

Create `components/growly/category-donut.tsx`:

```tsx
import { formatMoney } from '@/lib/money'

export function CategoryDonut({
  breakdown,
}: {
  breakdown: { id: string; name: string; colorHex: string; total: number }[]
}) {
  const total = breakdown.reduce((s, b) => s + b.total, 0)

  if (breakdown.length === 0 || total === 0) {
    return (
      <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 text-base font-extrabold text-foreground">Categorías</div>
        <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>
      </div>
    )
  }

  let acc = 0
  const stops = breakdown
    .map((b) => {
      const start = (acc / total) * 100
      acc += b.total
      const end = (acc / total) * 100
      return `${b.colorHex} ${start}% ${end}%`
    })
    .join(', ')

  return (
    <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 text-base font-extrabold text-foreground">Categorías</div>
      <div className="mb-4 flex justify-center">
        <div
          className="flex h-[130px] w-[130px] items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${stops})` }}
        >
          <div className="flex h-[84px] w-[84px] flex-col items-center justify-center rounded-full bg-card">
            <span className="text-xl font-extrabold text-foreground">{formatMoney(total, { withCents: false })}</span>
            <span className="text-[10px] text-muted-foreground">gastado</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {breakdown.map((b) => (
          <div key={b.id} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: b.colorHex }} />
            <span className="flex-1 text-muted-foreground">{b.name}</span>
            <span className="font-bold text-foreground">{formatMoney(b.total)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/dashboard-components.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add components/growly/balance-hero.tsx components/growly/kpi-card.tsx components/growly/category-donut.tsx tests/dashboard-components.test.tsx
git commit -m "feat: componentes BalanceHero, KpiCard y CategoryDonut"
```

---

### Task 4: Página del Dashboard `/` + e2e

**Files:**
- Modify: `app/(app)/page.tsx` (reemplaza el placeholder de Inicio)
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: `auth`; `getDashboardData` de `@/lib/dashboard`; `BalanceHero`, `KpiCard`, `CategoryDonut`, `TransactionRow` (B3); `Money`.
- Produces: la página `/`, `BalanceHero`, fila de 3 `KpiCard` (Ingresos/Gastos/Ahorro del mes), `CategoryDonut`, tarjeta "Próximos pagos" y tarjeta "Movimientos recientes" (con `TransactionRow`).

- [ ] **Step 1: Implementar `app/(app)/page.tsx`**

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getDashboardData } from '@/lib/dashboard'
import { BalanceHero } from '@/components/growly/balance-hero'
import { KpiCard } from '@/components/growly/kpi-card'
import { CategoryDonut } from '@/components/growly/category-donut'
import { TransactionRow } from '@/components/growly/transaction-row'
import { Money } from '@/components/growly/money'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const d = await getDashboardData(session.user.id, new Date())
  const catById = new Map(d.categories.map((c) => [c.id, c]))

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="md:col-span-1"><BalanceHero disponible={d.disponible} total={d.total} comprometido={d.comprometido} /></div>
        <KpiCard label="Ingresos" cents={d.monthly.income} accent="income" />
        <KpiCard label="Gastos" cents={d.monthly.expense} accent="expense" />
        <KpiCard label="Ahorro" cents={d.monthly.savings} accent="neutral" subtitle={`${d.monthly.savingsRate}% tasa`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CategoryDonut breakdown={d.breakdown} />

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
      </div>

      <div className="rounded-[20px] border border-border bg-card px-6 py-4 shadow-[var(--shadow-card)]">
        <div className="mb-2 text-base font-extrabold text-foreground">Movimientos recientes</div>
        {d.recent.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Aún no hay movimientos.</p>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--line)]">
            {d.recent.map((t) => {
              const cat = t.categoryId ? catById.get(t.categoryId) : null
              const signed = t.type === 'INCOME' ? t.amount : -t.amount
              return (
                <TransactionRow
                  key={t.id}
                  description={t.description}
                  meta={t.type === 'INCOME' ? 'Ingreso' : t.type === 'TRANSFER' ? 'Transferencia' : (cat?.name ?? 'Gasto')}
                  signedCents={signed}
                  iconName={cat?.icon ?? 'ellipsis'}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Escribir el e2e**

Create `tests/e2e/dashboard.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('el dashboard refleja el saldo de una cuenta nueva', async ({ page }) => {
  const email = `e2e_dash_${Date.now()}@growly.app`
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Dash')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('2000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText('Saldo disponible')).toBeVisible()
  await expect(page.getByText('$2,000.00').first()).toBeVisible()
})
```

- [ ] **Step 3: Verificar unidad + build + e2e**

Run: `npm test` → suite verde.
Run: `npm run build` → limpio (la página compila; sin placeholder de Inicio).
Run: `npm run test:e2e` → los 4 specs (auth, cuentas, movimientos, dashboard) pasan.

- [ ] **Step 4: Verificación manual (nice to have)**

`npm run dev` → login → crear cuenta + registrar un ingreso y un gasto → confirmar en `/` (Inicio): el hero muestra disponible/total/comprometido, los KPIs de ingresos/gastos/ahorro, el donut de categorías y los movimientos recientes. Compara con el diseño "Growly Web".

- [ ] **Step 5: Commit**

```bash
git add app/(app)/page.tsx tests/e2e/dashboard.spec.ts
git commit -m "feat: dashboard real en Inicio (saldo, KPIs, categorías, próximos, recientes)"
```

---

## Self-Review (cobertura vs. spec)

- **Dashboard principal (spec §Dashboard):** saldo disponible/total/comprometido, ingresos/gastos/ahorro del mes, gráfica de categorías (donut), próximos pagos, resumen → Tasks 1–4. ✅ Saldo por cuenta bancaria y "próximos cobros"/"tarjetas por vencer" se ven en /cuentas o se amplían en fases siguientes.
- **Estadísticas (spec §Estadísticas):** tasa de ahorro, gasto del mes → `monthlyTotals` (Tasks 1, 3, 4). Promedios/tendencias/mayor gasto → Reportes (Fase 3). ✅ (alcance)
- **Saldos reactivos (spec §4):** el dashboard lee `getAccountsWithBalances` + movimientos, así que refleja B2/B3 en vivo → Task 2. ✅
- **Multi-tenant (spec §7):** `getDashboardData` por `userId` de `auth()` → Tasks 2, 4. ✅
- **Diseño (spec §8):** hero `bg-forest`, KPIs, donut conic-gradient, tokens → Task 3. ✅
- **Consistencia de tipos:** `DashTx` (Task 1) usado por las agregaciones; `getDashboardData` (Task 2) devuelve la forma que consume la página (Task 4); `TransactionRow`/`Money` reutilizados. Sin placeholders. ✅

**Fuera de alcance de B4 (fases siguientes):** gráfica de flujo de caja de 6 meses (Reportes/Fase 3), presupuesto y metas en el dashboard (Fase 2), próximos cobros/alertas (Fase 3). **Nota:** con B4, el **MVP núcleo de la Fase 1 queda completo** (Auth + Dashboard + Cuentas/Tarjetas + Movimientos + Categorías).
