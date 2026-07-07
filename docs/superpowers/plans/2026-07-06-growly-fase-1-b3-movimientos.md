# Growly Fase 1 · B3 — Movimientos · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario registre ingresos, gastos y transferencias (con categoría, cuenta y fecha), los vea en una lista agrupada por día con filtros, y que esos movimientos actualicen automáticamente los saldos y el patrimonio neto de `/cuentas`.

**Architecture:** Misma estratificación que B2: `lib/transactions.ts` (funciones por `userId` + helper puro de agrupación) y `lib/categories.ts` sobre Prisma; `lib/transaction-actions.ts` con Server Actions (`auth()` + Zod + `revalidatePath`); componentes de presentación + un diálogo cliente (Base UI) para "Añadir"; la página `/movimientos` como Server Component. Los saldos ya se recalculan solos porque `getAccountsWithBalances` (B2) lee las transacciones.

**Tech Stack:** Next.js 16 (Server Actions), Prisma 6, Auth.js v5 (`auth()`), shadcn/Base UI (dialog), Zod, Vitest + RTL, Playwright, lucide-react.

## Global Constraints

- **Dinero = `Int` centavos.** `amount` siempre positivo; el **tipo** (`INCOME`/`EXPENSE`/`TRANSFER`) lleva la dirección, no el signo. Formateo vía `@/lib/money`; ingresos `text-acc`, gastos `text-foreground`.
- **Saldo:** `accountBalance`/`netWorth` (B1) ya excluyen `PENDING`. Un movimiento con `date` futura + `status='PENDING'` es un próximo pago (no afecta el saldo disponible).
- **Multi-tenant:** toda consulta/mutación filtra por `userId` de `auth()`; nunca un id de cliente.
- **Categorías:** las 20 del sistema (`userId=null`, sembradas) + las propias del usuario. Los `icon` son nombres lucide; **debe haber fallback** para nombres desconocidos (y `paw` debe resolver a `PawPrint`).
- **UI español**, formato `en-US`, tokens del design system. Fechas mostradas en español (`Hoy`/`Ayer`/`D MMM`).
- **Funciones puras** sin `Date.now()`/`new Date()` interno: el "ahora" se pasa como parámetro.
- **`.env` local/gitignored** — nunca tocar. **Convención de tests de DB** (del review de B2): email único por archivo, limpiar SOLO por `userId`/`email` propio, nunca `contains`. Tests de DB corren (dotenv) y limpian lo suyo.
- Commits en español `feat:`/`test:`.

---

## Estructura de archivos (B3)

```
lib/
├─ validators.ts             (MODIFICAR) + transactionSchema, TransactionFormValues
├─ transactions.ts           (CREAR) CRUD por userId + groupTransactionsByDay (puro)
├─ categories.ts             (CREAR) getCategoriesForUser
└─ transaction-actions.ts    (CREAR) server actions
components/growly/
├─ category-icon.tsx         (CREAR) name→lucide + fallback
├─ transaction-row.tsx       (CREAR) fila de movimiento
├─ money.tsx                 (MODIFICAR) + prop `signed` en <Money>
├─ account-row.tsx           (MODIFICAR) usar <Money signed> para saldos
└─ transaction-dialog.tsx    (CREAR) diálogo "Añadir" (Base UI)
app/(app)/movimientos/
└─ page.tsx                  (REEMPLAZAR el placeholder) lista por día + filtros
tests/
├─ transactions.test.ts
├─ categories.test.ts
├─ transaction-actions.test.ts
├─ transaction-components.test.tsx
├─ transaction-dialog.test.tsx
└─ e2e/movimientos.spec.ts
```

---

### Task 1: `transactionSchema` + `lib/transactions.ts` (CRUD + agrupación por día)

**Files:**
- Modify: `lib/validators.ts`
- Create: `lib/transactions.ts`
- Test: `tests/transactions.test.ts`

**Interfaces:**
- Consumes: `prisma`.
- Produces:
  - `transactionSchema` (Zod) + `type TransactionFormValues` en `@/lib/validators`.
  - `createTransactionForUser(userId: string, data: TransactionFormValues): Promise<Transaction>`
  - `getTransactionsForUser(userId: string, opts?: { kind?: 'INCOME' | 'EXPENSE' }): Promise<Transaction[]>` (orden `date desc`; `kind` filtra por `type`).
  - `deleteTransactionForUser(userId: string, id: string): Promise<{ count: number }>`
  - `groupTransactionsByDay<T extends { date: Date }>(txns: T[], now: Date): { label: string; items: T[] }[]` — puro; etiqueta `Hoy` / `Ayer` / `D MMM` (español, ej. `4 jul`), grupos en orden de fecha desc.

- [ ] **Step 1: Añadir `transactionSchema` a `lib/validators.ts`**

Añade al final (mantén lo existente):

```ts
export const transactionSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
    amount: z.number().int().positive(),
    accountId: z.string().min(1, 'Cuenta requerida'),
    categoryId: z.string().nullable().optional(),
    transferAccountId: z.string().nullable().optional(),
    description: z.string().min(1, 'Descripción requerida'),
    date: z.coerce.date(),
    status: z.enum(['CLEARED', 'PENDING']).default('CLEARED'),
    notes: z.string().optional(),
    currency: z.string().default('USD'),
  })
  .refine((d) => d.type !== 'TRANSFER' || !!d.transferAccountId, {
    message: 'La transferencia requiere cuenta destino',
    path: ['transferAccountId'],
  })

export type TransactionFormValues = z.infer<typeof transactionSchema>
```

- [ ] **Step 2: Escribir el test (debe fallar)**

Create `tests/transactions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  createTransactionForUser, getTransactionsForUser, deleteTransactionForUser, groupTransactionsByDay,
} from '@/lib/transactions'

describe('groupTransactionsByDay (puro)', () => {
  const now = new Date('2026-07-06T12:00:00Z')
  it('etiqueta Hoy / Ayer / fecha y ordena desc', () => {
    const txns = [
      { id: 'a', date: new Date('2026-07-06T09:00:00Z') },
      { id: 'b', date: new Date('2026-07-05T20:00:00Z') },
      { id: 'c', date: new Date('2026-07-01T10:00:00Z') },
    ]
    const groups = groupTransactionsByDay(txns, now)
    expect(groups.map((g) => g.label)).toEqual(['Hoy', 'Ayer', '1 jul'])
    expect(groups[0].items[0].id).toBe('a')
  })
})

describe.skipIf(!process.env.DATABASE_URL)('lib/transactions CRUD', () => {
  const email = `tx_${Date.now()}@growly.app`
  let userId = ''
  let accountId = ''
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Tx Test', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    accountId = a.id
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('crea y lista movimientos (desc)', async () => {
    await createTransactionForUser(userId, {
      type: 'EXPENSE', amount: 6230, accountId, description: 'Mercadona',
      date: new Date('2026-07-05'), status: 'CLEARED', currency: 'USD',
    })
    await createTransactionForUser(userId, {
      type: 'INCOME', amount: 306000, accountId, description: 'Nómina',
      date: new Date('2026-07-06'), status: 'CLEARED', currency: 'USD',
    })
    const all = await getTransactionsForUser(userId)
    expect(all.length).toBe(2)
    expect(all[0].description).toBe('Nómina') // más reciente primero
    const gastos = await getTransactionsForUser(userId, { kind: 'EXPENSE' })
    expect(gastos.length).toBe(1)
  })

  it('borra un movimiento del usuario (y no de otro)', async () => {
    const all = await getTransactionsForUser(userId)
    expect((await deleteTransactionForUser('otro', all[0].id)).count).toBe(0)
    expect((await deleteTransactionForUser(userId, all[0].id)).count).toBe(1)
    expect((await getTransactionsForUser(userId)).length).toBe(1)
  })
})
```

- [ ] **Step 3: Ejecutar y ver fallar**

Run: `npm test -- tests/transactions.test.ts`
Expected: FAIL (`Cannot find module '@/lib/transactions'`).

- [ ] **Step 4: Implementar `lib/transactions.ts`**

```ts
import { prisma } from '@/lib/prisma'
import type { TransactionFormValues } from '@/lib/validators'

export function createTransactionForUser(userId: string, data: TransactionFormValues) {
  return prisma.transaction.create({ data: { ...data, userId } })
}

export function getTransactionsForUser(
  userId: string,
  opts: { kind?: 'INCOME' | 'EXPENSE' } = {},
) {
  return prisma.transaction.findMany({
    where: { userId, ...(opts.kind ? { type: opts.kind } : {}) },
    orderBy: { date: 'desc' },
  })
}

export function deleteTransactionForUser(userId: string, id: string) {
  return prisma.transaction.deleteMany({ where: { id, userId } })
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export function groupTransactionsByDay<T extends { date: Date }>(
  txns: T[],
  now: Date,
): { label: string; items: T[] }[] {
  const sorted = [...txns].sort((a, b) => b.date.getTime() - a.date.getTime())
  const todayKey = dayKey(now)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const yKey = dayKey(yesterday)

  const groups: { label: string; items: T[] }[] = []
  const index = new Map<string, { label: string; items: T[] }>()
  for (const t of sorted) {
    const key = dayKey(t.date)
    let g = index.get(key)
    if (!g) {
      const label = key === todayKey ? 'Hoy' : key === yKey ? 'Ayer' : `${t.date.getDate()} ${MESES[t.date.getMonth()]}`
      g = { label, items: [] }
      index.set(key, g)
      groups.push(g)
    }
    g.items.push(t)
  }
  return groups
}
```

- [ ] **Step 5: Ejecutar y ver pasar**

Run: `npm test -- tests/transactions.test.ts`
Expected: PASS (grupo puro + 2 tests de DB).

- [ ] **Step 6: Commit**

```bash
git add lib/validators.ts lib/transactions.ts tests/transactions.test.ts
git commit -m "feat: lib/transactions — CRUD de movimientos y agrupación por día"
```

---

### Task 2: `lib/categories.ts` — categorías del usuario

**Files:**
- Create: `lib/categories.ts`
- Test: `tests/categories.test.ts`

**Interfaces:**
- Consumes: `prisma`.
- Produces: `getCategoriesForUser(userId: string): Promise<Category[]>` — categorías del sistema (`userId=null`) + las del usuario, ordenadas por `name asc`.

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/categories.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getCategoriesForUser } from '@/lib/categories'

describe.skipIf(!process.env.DATABASE_URL)('getCategoriesForUser', () => {
  const email = `cat_${Date.now()}@growly.app`
  let userId = ''
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Cat Test', email } })
    userId = u.id
    await prisma.category.create({ data: { userId, name: 'Mi categoría', kind: 'EXPENSE' } })
  })
  afterAll(async () => {
    await prisma.category.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('incluye las del sistema y las propias', async () => {
    const cats = await getCategoriesForUser(userId)
    expect(cats.some((c) => c.isSystem && c.name === 'Alimentación')).toBe(true)
    expect(cats.some((c) => c.userId === userId && c.name === 'Mi categoría')).toBe(true)
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/categories.test.ts`
Expected: FAIL (`Cannot find module '@/lib/categories'`).

- [ ] **Step 3: Implementar `lib/categories.ts`**

```ts
import { prisma } from '@/lib/prisma'

export function getCategoriesForUser(userId: string) {
  return prisma.category.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: { name: 'asc' },
  })
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/categories.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/categories.ts tests/categories.test.ts
git commit -m "feat: lib/categories — categorías del sistema y del usuario"
```

---

### Task 3: Server Actions (`lib/transaction-actions.ts`)

**Files:**
- Create: `lib/transaction-actions.ts`
- Test: `tests/transaction-actions.test.ts`

**Interfaces:**
- Consumes: `auth`; `transactionSchema`; `createTransactionForUser`, `deleteTransactionForUser`; `revalidatePath`.
- Produces:
  - `createTransaction(values: unknown): Promise<{ ok: true } | { ok: false; error: string }>` — auth guard, valida, crea, revalida `/movimientos`, `/cuentas` y `/`.
  - `deleteTransaction(id: string): Promise<{ ok: true } | { ok: false; error: string }>` — auth guard, borra, revalida las mismas rutas.

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/transaction-actions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const email = `txaction_${Date.now()}@growly.app`
let userId = ''
let accountId = ''

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createTransaction, deleteTransaction } from '@/lib/transaction-actions'

describe.skipIf(!process.env.DATABASE_URL)('transaction actions', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'TxA Test', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    accountId = a.id
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('createTransaction crea el movimiento', async () => {
    const res = await createTransaction({
      type: 'EXPENSE', amount: 5000, accountId, description: 'Café',
      date: '2026-07-06', currency: 'USD',
    })
    expect(res.ok).toBe(true)
    expect((await prisma.transaction.count({ where: { userId } }))).toBe(1)
  })

  it('createTransaction rechaza inválido (transfer sin destino)', async () => {
    const res = await createTransaction({
      type: 'TRANSFER', amount: 5000, accountId, description: 'x', date: '2026-07-06',
    })
    expect(res.ok).toBe(false)
  })

  it('deleteTransaction borra el movimiento', async () => {
    const t = await prisma.transaction.findFirst({ where: { userId } })
    const res = await deleteTransaction(t!.id)
    expect(res.ok).toBe(true)
    expect((await prisma.transaction.count({ where: { userId } }))).toBe(0)
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/transaction-actions.test.ts`
Expected: FAIL (`Cannot find module '@/lib/transaction-actions'`).

- [ ] **Step 3: Implementar `lib/transaction-actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { transactionSchema } from '@/lib/validators'
import { createTransactionForUser, deleteTransactionForUser } from '@/lib/transactions'

function revalidate() {
  revalidatePath('/movimientos')
  revalidatePath('/cuentas')
  revalidatePath('/')
}

export async function createTransaction(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsed = transactionSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  try {
    await createTransactionForUser(session.user.id, parsed.data)
  } catch {
    return { ok: false as const, error: 'No se pudo guardar el movimiento' }
  }
  revalidate()
  return { ok: true as const }
}

export async function deleteTransaction(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  try {
    await deleteTransactionForUser(session.user.id, id)
  } catch {
    return { ok: false as const, error: 'No se pudo borrar el movimiento' }
  }
  revalidate()
  return { ok: true as const }
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/transaction-actions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/transaction-actions.ts tests/transaction-actions.test.ts
git commit -m "feat: server actions de movimientos (createTransaction, deleteTransaction)"
```

---

### Task 4: Componentes — `CategoryIcon`, `TransactionRow`, `<Money signed>`

**Files:**
- Create: `components/growly/category-icon.tsx`, `components/growly/transaction-row.tsx`
- Modify: `components/growly/money.tsx` (prop `signed`), `components/growly/account-row.tsx` (usar `signed`)
- Test: `tests/transaction-components.test.tsx`

**Interfaces:**
- Consumes: `lucide-react`; `SignedAmount` de `@/components/growly/money`; `cn`.
- Produces:
  - `<CategoryIcon name={string} size?={number} />` — mapea un nombre lucide (`home`, `utensils`, `paw`→PawPrint, …) a su icono; **fallback** `Circle` para nombres desconocidos.
  - `<TransactionRow description={string} meta={string} signedCents={number} iconName?={string} />` — fila: icono de categoría, descripción, meta (`categoría · hora`), importe con `<SignedAmount>`.
  - `<Money>` acepta `signed?: boolean` — cuando `true` y `cents < 0`, antepone `−` (positivos sin signo). Default `false` (comportamiento actual: magnitud).

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/transaction-components.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CategoryIcon } from '@/components/growly/category-icon'
import { TransactionRow } from '@/components/growly/transaction-row'
import { Money } from '@/components/growly/money'

describe('<CategoryIcon>', () => {
  it('renderiza un svg para un nombre conocido y para uno desconocido (fallback)', () => {
    const { container: known } = render(<CategoryIcon name="utensils" />)
    expect(known.querySelector('svg')).toBeInTheDocument()
    const { container: unknown } = render(<CategoryIcon name="no-existe-xyz" />)
    expect(unknown.querySelector('svg')).toBeInTheDocument()
  })
})

describe('<TransactionRow>', () => {
  it('muestra descripción, meta e importe con signo', () => {
    render(<TransactionRow description="Nómina" meta="Ingreso · 09:12" signedCents={306000} />)
    expect(screen.getByText('Nómina')).toBeInTheDocument()
    expect(screen.getByText('Ingreso · 09:12')).toBeInTheDocument()
    expect(screen.getByText('+$3,060.00')).toBeInTheDocument()
  })
})

describe('<Money signed>', () => {
  it('antepone − a negativos y nada a positivos', () => {
    render(<Money cents={-5000} signed />)
    expect(screen.getByText('−$50.00')).toBeInTheDocument()
    render(<Money cents={5000} signed />)
    expect(screen.getByText('$50.00')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/transaction-components.test.tsx`
Expected: FAIL (módulos/props no existen).

- [ ] **Step 3: Implementar los componentes**

Create `components/growly/category-icon.tsx`:

```tsx
import {
  Home, Utensils, Car, Fuel, Plug, Wifi, Zap, Droplet, Phone, Play, Book, Heart,
  PawPrint, Shield, Shirt, Ticket, Landmark, TrendingUp, PiggyBank, Ellipsis, Circle,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  home: Home, utensils: Utensils, car: Car, fuel: Fuel, plug: Plug, wifi: Wifi,
  zap: Zap, droplet: Droplet, phone: Phone, play: Play, book: Book, heart: Heart,
  paw: PawPrint, 'paw-print': PawPrint, shield: Shield, shirt: Shirt, ticket: Ticket,
  landmark: Landmark, 'trending-up': TrendingUp, 'piggy-bank': PiggyBank, ellipsis: Ellipsis,
}

export function CategoryIcon({ name, size = 19 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Circle
  return <Icon size={size} />
}
```

Update `components/growly/money.tsx` — add the `signed` prop to `Money` (keep `SignedAmount` unchanged):

```tsx
export function Money({
  cents,
  withCents = true,
  currency = 'USD',
  signed = false,
  className,
}: {
  cents: number
  withCents?: boolean
  currency?: string
  signed?: boolean
  className?: string
}) {
  const prefix = signed && cents < 0 ? '−' : ''
  return (
    <span className={className}>
      {prefix}
      {formatMoney(cents, { withCents, currency })}
    </span>
  )
}
```

Create `components/growly/transaction-row.tsx`:

```tsx
import { CategoryIcon } from '@/components/growly/category-icon'
import { SignedAmount } from '@/components/growly/money'

export function TransactionRow({
  description, meta, signedCents, iconName = 'ellipsis',
}: {
  description: string
  meta: string
  signedCents: number
  iconName?: string
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <CategoryIcon name={iconName} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-foreground">{description}</div>
        <div className="text-xs text-muted-foreground">{meta}</div>
      </div>
      <SignedAmount cents={signedCents} className="text-[15px] font-extrabold" />
    </div>
  )
}
```

Update `components/growly/account-row.tsx` — render the balance with sign (change only the `<Money>` usage):

```tsx
<Money cents={balance} signed className="text-base font-extrabold text-foreground" />
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/transaction-components.test.tsx`
Expected: PASS. Then run the full suite `npm test` — the existing `account-components.test.tsx` (`$12,340.00` positive) still passes because `signed` adds no prefix to positives.

- [ ] **Step 5: Commit**

```bash
git add components/growly/category-icon.tsx components/growly/transaction-row.tsx components/growly/money.tsx components/growly/account-row.tsx tests/transaction-components.test.tsx
git commit -m "feat: CategoryIcon (con fallback), TransactionRow y <Money signed>"
```

---

### Task 5: Diálogo "Añadir movimiento" (`transaction-dialog.tsx`)

**Files:**
- Create: `components/growly/transaction-dialog.tsx`
- Test: `tests/transaction-dialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogTrigger`/`DialogContent`/`DialogTitle` de `@/components/ui/dialog`; `Button`, `Input`, `Label`; `createTransaction` de `@/lib/transaction-actions`; `parseAmountToCents` de `@/lib/money`.
- Produces: `<TransactionDialog accounts={AccountOpt[]} categories={CategoryOpt[]} />` donde `AccountOpt = { id: string; name: string }` y `CategoryOpt = { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }`. Botón "Añadir" abre el diálogo con: segmento **Gasto / Ingreso / Transferencia**; **Importe**; **Fecha**; **Descripción**; si Gasto/Ingreso → **Categoría** (filtrada por tipo) + **Cuenta**; si Transferencia → **Cuenta origen** + **Cuenta destino**. Envía a `createTransaction` con `amount` en centavos.

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/transaction-dialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/transaction-actions', () => ({ createTransaction: vi.fn(async () => ({ ok: true })) }))
import { TransactionDialog } from '@/components/growly/transaction-dialog'

const accounts = [{ id: 'a1', name: 'Corriente' }, { id: 'a2', name: 'Ahorros' }]
const categories = [
  { id: 'c1', name: 'Comida', kind: 'EXPENSE' as const },
  { id: 'c2', name: 'Nómina', kind: 'INCOME' as const },
]

describe('<TransactionDialog>', () => {
  it('abre con campos de gasto por defecto', async () => {
    render(<TransactionDialog accounts={accounts} categories={categories} />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir/i }))
    expect(await screen.findByLabelText('Importe')).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument()
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Cuenta')).toBeInTheDocument()
  })

  it('en Transferencia muestra cuenta origen y destino, sin categoría', async () => {
    render(<TransactionDialog accounts={accounts} categories={categories} />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Transferencia' }))
    expect(screen.getByLabelText('Cuenta origen')).toBeInTheDocument()
    expect(screen.getByLabelText('Cuenta destino')).toBeInTheDocument()
    expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/transaction-dialog.test.tsx`
Expected: FAIL (`Cannot find module '@/components/growly/transaction-dialog'`).

- [ ] **Step 3: Implementar `components/growly/transaction-dialog.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTransaction } from '@/lib/transaction-actions'
import { parseAmountToCents } from '@/lib/money'

type AccountOpt = { id: string; name: string }
type CategoryOpt = { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }
type TxType = 'EXPENSE' | 'INCOME' | 'TRANSFER'

const SEG: { value: TxType; label: string }[] = [
  { value: 'EXPENSE', label: 'Gasto' },
  { value: 'INCOME', label: 'Ingreso' },
  { value: 'TRANSFER', label: 'Transferencia' },
]

const selectCls = 'h-11 w-full rounded-md border border-input bg-field px-3 text-sm'

export function TransactionDialog({
  accounts, categories,
}: {
  accounts: AccountOpt[]
  categories: CategoryOpt[]
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<TxType>('EXPENSE')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset() { setType('EXPENSE'); setError(null) }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError(null)
    const fd = new FormData(e.currentTarget)
    const amount = parseAmountToCents(String(fd.get('amount') ?? ''))
    if (!amount) { setError('Importe no válido'); setLoading(false); return }

    const payload = {
      type,
      amount,
      description: String(fd.get('description') ?? ''),
      date: String(fd.get('date') ?? ''),
      currency: 'USD',
      accountId: String(fd.get('accountId') ?? ''),
      categoryId: type === 'TRANSFER' ? null : (String(fd.get('categoryId') ?? '') || null),
      transferAccountId: type === 'TRANSFER' ? String(fd.get('transferAccountId') ?? '') : null,
    }
    const res = await createTransaction(payload)
    setLoading(false)
    if (!res.ok) { setError(res.error); return }
    setOpen(false); reset()
  }

  const cats = categories.filter((c) => c.kind === (type === 'INCOME' ? 'INCOME' : 'EXPENSE'))

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger
        render={<Button className="h-11 font-extrabold"><Plus size={18} /> Añadir</Button>}
      />
      <DialogContent className="w-full max-w-[440px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">Nuevo movimiento</DialogTitle>

        <div className="mb-4 flex gap-1 rounded-xl bg-muted p-1">
          {SEG.map((s) => (
            <button
              key={s.value} type="button" onClick={() => setType(s.value)}
              className={`flex-1 rounded-lg py-2 text-sm font-bold ${type === s.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="amount">Importe</Label>
            <Input id="amount" name="amount" inputMode="decimal" placeholder="0.00" required />
          </div>
          <div>
            <Label htmlFor="description">Descripción</Label>
            <Input id="description" name="description" required />
          </div>

          {type !== 'TRANSFER' ? (
            <>
              <div>
                <Label htmlFor="categoryId">Categoría</Label>
                <select id="categoryId" name="categoryId" className={selectCls}>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="accountId">Cuenta</Label>
                <select id="accountId" name="accountId" className={selectCls}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="accountId">Cuenta origen</Label>
                <select id="accountId" name="accountId" className={selectCls}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="transferAccountId">Cuenta destino</Label>
                <select id="transferAccountId" name="transferAccountId" className={selectCls}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="date">Fecha</Label>
            <Input id="date" name="date" type="date" required />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-2 h-11 font-extrabold">Guardar</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

> Nota: ajusta la API de `Dialog`/`DialogTrigger` a la del `components/ui/dialog.tsx` real (igual que en B2 usó `render`/`open`/`onOpenChange`). El contrato de comportamiento son los labels exactos y el segmento.

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/transaction-dialog.test.tsx`
Expected: PASS (2 tests). Si el diálogo no abre en jsdom, replica el patrón que funcionó en `account-dialog.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/growly/transaction-dialog.tsx tests/transaction-dialog.test.tsx
git commit -m "feat: diálogo Añadir movimiento (gasto/ingreso/transferencia)"
```

---

### Task 6: Página `/movimientos` real + e2e

**Files:**
- Modify: `app/(app)/movimientos/page.tsx` (reemplaza el `ComingSoon`)
- Test: `tests/e2e/movimientos.spec.ts`

**Interfaces:**
- Consumes: `auth`; `getTransactionsForUser`, `groupTransactionsByDay` de `@/lib/transactions`; `getAccountsForUser` de `@/lib/accounts`; `getCategoriesForUser` de `@/lib/categories`; `TransactionRow`, `TransactionDialog`.
- Produces: `/movimientos` — título, chips de filtro (Todos / Ingresos / Gastos vía `?tipo=`), botón `<TransactionDialog>`, lista agrupada por día con `<TransactionRow>` (importe con signo según tipo), estado vacío.

- [ ] **Step 1: Implementar `app/(app)/movimientos/page.tsx`**

```tsx
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getTransactionsForUser, groupTransactionsByDay } from '@/lib/transactions'
import { getAccountsForUser } from '@/lib/accounts'
import { getCategoriesForUser } from '@/lib/categories'
import { TransactionRow } from '@/components/growly/transaction-row'
import { TransactionDialog } from '@/components/growly/transaction-dialog'

const FILTERS = [
  { key: undefined, label: 'Todos', href: '/movimientos' },
  { key: 'INCOME' as const, label: 'Ingresos', href: '/movimientos?tipo=ingresos' },
  { key: 'EXPENSE' as const, label: 'Gastos', href: '/movimientos?tipo=gastos' },
]

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { tipo } = await searchParams
  const kind = tipo === 'ingresos' ? 'INCOME' : tipo === 'gastos' ? 'EXPENSE' : undefined

  const [txns, accounts, categories] = await Promise.all([
    getTransactionsForUser(userId, kind ? { kind } : {}),
    getAccountsForUser(userId),
    getCategoriesForUser(userId),
  ])
  const catById = new Map(categories.map((c) => [c.id, c]))
  const groups = groupTransactionsByDay(txns, new Date())

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Movimientos</h1>
        <TransactionDialog
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        />
      </div>

      <div className="mb-5 flex gap-2">
        {FILTERS.map((f) => {
          const active = f.key === kind
          return (
            <Link key={f.label} href={f.href}
              className={`rounded-[11px] px-4 py-2 text-sm font-bold ${active ? 'bg-forest text-white' : 'border border-border bg-card text-muted-foreground'}`}>
              {f.label}
            </Link>
          )
        })}
      </div>

      {txns.length === 0 && (
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">Aún no hay movimientos. Añade el primero.</p>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="mb-2 px-1 text-xs font-bold tracking-wide text-muted-foreground">{g.label.toUpperCase()}</div>
            <div className="rounded-[22px] border border-border bg-card px-5 shadow-[var(--shadow-card)]">
              {g.items.map((t) => {
                const cat = t.categoryId ? catById.get(t.categoryId) : null
                const time = new Date(t.date).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
                const kindLabel = t.type === 'INCOME' ? 'Ingreso' : t.type === 'TRANSFER' ? 'Transferencia' : (cat?.name ?? 'Gasto')
                const signed = t.type === 'INCOME' ? t.amount : -t.amount
                return (
                  <TransactionRow
                    key={t.id}
                    description={t.description}
                    meta={`${kindLabel} · ${time}`}
                    signedCents={signed}
                    iconName={cat?.icon ?? 'ellipsis'}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Escribir el e2e**

Create `tests/e2e/movimientos.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('añadir un gasto y verlo en Movimientos', async ({ page }) => {
  const email = `e2e_mov_${Date.now()}@growly.app`
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Mov')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // crear una cuenta primero (para asignar el gasto)
  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  // añadir un gasto
  await page.goto('/movimientos')
  await page.getByRole('button', { name: /Añadir/i }).click()
  await page.getByLabel('Importe').fill('62.30')
  await page.getByLabel('Descripción').fill('Mercadona')
  await page.getByLabel('Fecha').fill('2026-07-06')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByText('Mercadona')).toBeVisible()
  await expect(page.getByText('−$62.30')).toBeVisible()
})
```

- [ ] **Step 3: Verificar unidad + build + e2e**

Run: `npm test` → suite verde.
Run: `npm run build` → limpio (la página compila, sin `ComingSoon`).
Run: `npm run test:e2e` → los 3 specs (auth, cuentas, movimientos) pasan.

- [ ] **Step 4: Verificación manual (nice to have)**

`npm run dev` → login → crear cuenta → `/movimientos` → "Añadir" → registrar un gasto y un ingreso → confirmar que aparecen agrupados por día, que el filtro Ingresos/Gastos funciona, y que en `/cuentas` el saldo bajó por el gasto. Compara con el diseño "Movimientos".

- [ ] **Step 5: Commit**

```bash
git add app/(app)/movimientos/page.tsx tests/e2e/movimientos.spec.ts
git commit -m "feat: página /movimientos real (lista por día, filtros, alta)"
```

---

## Self-Review (cobertura vs. spec)

- **Gestión de movimientos (spec §Movimientos):** ingreso/gasto/transferencia con categoría, cuenta, fecha, descripción → `transactionSchema` + `lib/transactions` + diálogo (Tasks 1, 3, 5, 6). Reembolso/ajuste y comprobante/etiquetas → fases posteriores. ✅ (alcance)
- **Categorías (spec §Categorías):** sistema + propias, iconografía con fallback (arregla `paw`) → `lib/categories` + `CategoryIcon` (Tasks 2, 4). Crear categoría personalizada desde la UI → posterior. ✅ (alcance)
- **Lista por día + filtros (diseño App "Movimientos"):** `groupTransactionsByDay` + chips → Tasks 1, 6. ✅
- **Saldos reactivos (spec §4):** al crear movimientos, `getAccountsWithBalances` (B2) recomputa; el action revalida `/cuentas` y `/` → Task 3. `AccountRow` ahora muestra signo (`<Money signed>`) → Task 4. ✅
- **Multi-tenant/seguridad (spec §7):** todo por `userId` de `auth()`; borrado con filtro `userId` → Tasks 1, 3. ✅
- **Consistencia de tipos:** `TransactionFormValues` (Task 1) usado por `createTransactionForUser`/`createTransaction` (Tasks 1, 3, 5); `AccountOpt`/`CategoryOpt` del diálogo (Task 5) alimentados por la página (Task 6); `SignedAmount`/`Money` de B1 reutilizados. Sin placeholders. ✅

**Fuera de alcance de B3 (van en B4+):** el Dashboard real, editar movimiento (solo crear/borrar en B3), presupuestos, wiring del botón "Añadir" del topbar global (el diálogo vive por ahora en `/movimientos`). **Nota:** el motor de recurrencias (movimientos automáticos) es Fase 2; en B3 un `PENDING` con fecha futura ya modela un próximo pago.
