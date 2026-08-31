# Growly Fase 1 · B2: Cuentas y Tarjetas · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el usuario pueda crear, ver y archivar sus cuentas y tarjetas de crédito, con el patrimonio neto y la utilización de tarjeta calculados en vivo, reemplazando el placeholder de `/cuentas` por la página real.

**Architecture:** Lógica de datos en `lib/accounts.ts` como funciones que reciben `userId` explícito (testeables contra la DB, reutilizan `lib/balances` de B1). Encima, `lib/account-actions.ts` expone Server Actions delgadas (`'use server'`) que sacan el `userId` de `auth()`, validan con Zod y revalidan la ruta. La UI son Server Components que leen datos + un diálogo cliente (Base UI) para el alta.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Prisma 6, Auth.js v5 (`auth()` con `session.user.id`), shadcn/Base UI (dialog), Zod, Vitest + RTL, Playwright.

## Global Constraints

- **Dinero = `Int` en centavos.** Formateo vía `@/lib/money` (`formatMoney`, `parseAmountToCents`, `toCents`). Nunca `Float`.
- **Saldos calculados** con `@/lib/balances` (`accountBalance`, `cardUsed`, `cardUtilization`, `netWorth`), no mutados. En B2 aún no hay movimientos, así que los saldos = `initialBalance` (se actualizarán solos en B3).
- **Modelo `Account` unificado** (`AccountType`: `CHECKING|SAVINGS|CASH|CREDIT_CARD`); campos de tarjeta (`creditLimit`, `statementDay`, `dueDay`, `apr`, `minPayment`) solo aplican a `CREDIT_CARD`.
- **Multi-tenant estricto:** toda consulta y mutación filtra por `userId` (obtenido de `auth()`), nunca confía en un id del cliente.
- **UI en español**, formato numérico `en-US`, tokens del design system (`text-acc`, `bg-forest`, `text-destructive`, `shadow-[var(--shadow-card)]`, etc.). El schema NO guarda número de cuenta/tarjeta → subtítulo = banco; la tarjeta muestra dígitos genéricos `····` (estético).
- **`.env` es local y gitignored**: nunca tocarlo/commitearlo. `session.user.id` ya existe (fix de Fase 0).
- **Tests:** Vitest TDD; los que tocan DB corren gracias a `dotenv` en `tests/setup.ts` y limpian lo que crean. Commits en español `feat:`/`test:`.

---

## Estructura de archivos (B2)

```
lib/
├─ validators.ts       (MODIFICAR) + accountSchema, AccountFormValues
├─ accounts.ts         (CREAR) funciones de datos por userId
└─ account-actions.ts  (CREAR) server actions
components/growly/
├─ account-row.tsx     (CREAR) fila de cuenta normal
├─ credit-card.tsx     (CREAR) tarjeta de crédito (visual + utilización)
└─ account-dialog.tsx  (CREAR) diálogo de alta (Base UI)
app/(app)/cuentas/
└─ page.tsx            (REEMPLAZAR el placeholder) página real
tests/
├─ accounts.test.ts
├─ account-actions.test.ts
├─ account-components.test.tsx
└─ e2e/cuentas.spec.ts
```

---

### Task 1: `accountSchema` + `lib/accounts.ts` (crear / listar / archivar)

**Files:**
- Modify: `lib/validators.ts` (añadir `accountSchema` + `AccountFormValues`)
- Create: `lib/accounts.ts`
- Test: `tests/accounts.test.ts`

**Interfaces:**
- Consumes: `prisma` de `@/lib/prisma`.
- Produces:
  - `accountSchema` (Zod) y `type AccountFormValues = z.infer<typeof accountSchema>` en `@/lib/validators`.
  - `createAccountForUser(userId: string, data: AccountFormValues): Promise<Account>`
  - `getAccountsForUser(userId: string): Promise<Account[]>` (no archivadas, orden `createdAt asc`)
  - `archiveAccountForUser(userId: string, accountId: string): Promise<{ count: number }>` (usa `updateMany` filtrando por `userId` para no archivar cuentas ajenas)

- [ ] **Step 1: Añadir el schema a `lib/validators.ts`**

Añade al final de `lib/validators.ts` (mantén lo existente: `registerSchema`, `loginSchema`):

```ts
export const accountSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  bankName: z.string().trim().optional(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CASH', 'CREDIT_CARD']),
  currency: z.string().default('USD'),
  colorHex: z.string().default('#10B981'),
  initialBalance: z.number().int().default(0), // centavos
  creditLimit: z.number().int().nonnegative().nullable().optional(),
  statementDay: z.number().int().min(1).max(31).nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  apr: z.number().nonnegative().nullable().optional(),
  minPayment: z.number().int().nonnegative().nullable().optional(),
})

export type AccountFormValues = z.infer<typeof accountSchema>
```

- [ ] **Step 2: Escribir el test (debe fallar)**

Create `tests/accounts.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createAccountForUser, getAccountsForUser, archiveAccountForUser } from '@/lib/accounts'

const email = `acc_${Date.now()}@growly.app`
let userId: string

describe.skipIf(!process.env.DATABASE_URL)('lib/accounts CRUD', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Acc Test', email } })
    userId = u.id
  })
  afterAll(async () => {
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('crea una cuenta para el usuario', async () => {
    const acc = await createAccountForUser(userId, {
      name: 'Cuenta corriente', bankName: 'BBVA', type: 'CHECKING',
      currency: 'USD', colorHex: '#10B981', initialBalance: 1234000,
    })
    expect(acc.id).toBeTruthy()
    expect(acc.userId).toBe(userId)
    expect(acc.initialBalance).toBe(1234000)
  })

  it('lista solo cuentas no archivadas del usuario', async () => {
    const list = await getAccountsForUser(userId)
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('Cuenta corriente')
  })

  it('archiva la cuenta (y no la lista después)', async () => {
    const list = await getAccountsForUser(userId)
    const res = await archiveAccountForUser(userId, list[0].id)
    expect(res.count).toBe(1)
    expect((await getAccountsForUser(userId)).length).toBe(0)
  })

  it('no archiva cuentas de otro usuario', async () => {
    const acc = await createAccountForUser(userId, {
      name: 'Otra', type: 'CASH', currency: 'USD', colorHex: '#10B981', initialBalance: 0,
    })
    const res = await archiveAccountForUser('user-inexistente', acc.id)
    expect(res.count).toBe(0)
  })
})
```

- [ ] **Step 3: Ejecutar y ver fallar**

Run: `npm test -- tests/accounts.test.ts`
Expected: FAIL (`Cannot find module '@/lib/accounts'`).

- [ ] **Step 4: Implementar `lib/accounts.ts`**

```ts
import { prisma } from '@/lib/prisma'
import type { AccountFormValues } from '@/lib/validators'

export function createAccountForUser(userId: string, data: AccountFormValues) {
  return prisma.account.create({ data: { ...data, userId } })
}

export function getAccountsForUser(userId: string) {
  return prisma.account.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: 'asc' },
  })
}

export function archiveAccountForUser(userId: string, accountId: string) {
  return prisma.account.updateMany({
    where: { id: accountId, userId },
    data: { archived: true },
  })
}
```

- [ ] **Step 5: Ejecutar y ver pasar**

Run: `npm test -- tests/accounts.test.ts`
Expected: PASS (4 tests, corren contra la DB).

- [ ] **Step 6: Commit**

```bash
git add lib/validators.ts lib/accounts.ts tests/accounts.test.ts
git commit -m "feat: lib/accounts — crear, listar y archivar cuentas"
```

---

### Task 2: `getAccountsWithBalances`, saldos y patrimonio neto

**Files:**
- Modify: `lib/accounts.ts`
- Test: `tests/accounts.test.ts` (añadir un describe)

**Interfaces:**
- Consumes: `prisma`; `accountBalance`, `cardUtilization`, `netWorth`, tipos `AccountInput as BalanceAccount`, `TxInput` de `@/lib/balances`.
- Produces:
  - `type AccountWithBalance = Account & { balance: number; utilization: { used: number; available: number; pct: number } | null }`
  - `getAccountsWithBalances(userId: string): Promise<{ accounts: AccountWithBalance[]; netWorth: number }>`: para cuentas normales `balance = accountBalance`; para tarjetas `balance = -used` y `utilization` poblado; `netWorth` global.

- [ ] **Step 1: Escribir el test (debe fallar)**

Añade a `tests/accounts.test.ts` un nuevo bloque (dentro del mismo archivo, tras los imports añade `getAccountsWithBalances`):

```ts
import { getAccountsWithBalances } from '@/lib/accounts'

describe.skipIf(!process.env.DATABASE_URL)('getAccountsWithBalances', () => {
  const email2 = `bal_${Date.now()}@growly.app`
  let uid2: string
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Bal Test', email: email2 } })
    uid2 = u.id
    await createAccountForUser(uid2, { name: 'Corriente', type: 'CHECKING', currency: 'USD', colorHex: '#10B981', initialBalance: 1000000 })
    await createAccountForUser(uid2, { name: 'Visa', type: 'CREDIT_CARD', currency: 'USD', colorHex: '#12211C', initialBalance: 64000, creditLimit: 300000 })
  })
  afterAll(async () => {
    await prisma.account.deleteMany({ where: { userId: uid2 } })
    await prisma.user.delete({ where: { id: uid2 } })
  })

  it('calcula balance por cuenta y patrimonio neto', async () => {
    const { accounts, netWorth } = await getAccountsWithBalances(uid2)
    const checking = accounts.find((a) => a.type === 'CHECKING')!
    const card = accounts.find((a) => a.type === 'CREDIT_CARD')!
    expect(checking.balance).toBe(1000000)
    expect(checking.utilization).toBeNull()
    expect(card.utilization).toEqual({ used: 64000, available: 236000, pct: 21 })
    expect(card.balance).toBe(-64000)
    // $10,000 - deuda $640 = $9,360
    expect(netWorth).toBe(1000000 - 64000)
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/accounts.test.ts`
Expected: FAIL (`getAccountsWithBalances is not a function`).

- [ ] **Step 3: Implementar en `lib/accounts.ts`**

Añade (mantén las funciones existentes):

```ts
import {
  accountBalance, cardUtilization, netWorth as computeNetWorth,
  type AccountInput as BalanceAccount, type TxInput,
} from '@/lib/balances'
import type { Account } from '@prisma/client'

export type AccountWithBalance = Account & {
  balance: number
  utilization: { used: number; available: number; pct: number } | null
}

export async function getAccountsWithBalances(
  userId: string,
): Promise<{ accounts: AccountWithBalance[]; netWorth: number }> {
  const accounts = await prisma.account.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: 'asc' },
  })
  const txns = await prisma.transaction.findMany({ where: { userId } })

  const balTxns: TxInput[] = txns.map((t) => ({
    type: t.type, amount: t.amount, accountId: t.accountId,
    transferAccountId: t.transferAccountId, status: t.status,
  }))
  const toBal = (a: Account): BalanceAccount => ({
    id: a.id, type: a.type, initialBalance: a.initialBalance, creditLimit: a.creditLimit,
  })

  const withBalances: AccountWithBalance[] = accounts.map((a) => {
    if (a.type === 'CREDIT_CARD') {
      const util = cardUtilization(toBal(a), balTxns)
      return { ...a, balance: -util.used, utilization: util }
    }
    return { ...a, balance: accountBalance(toBal(a), balTxns), utilization: null }
  })

  return { accounts: withBalances, netWorth: computeNetWorth(accounts.map(toBal), balTxns) }
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/accounts.test.ts`
Expected: PASS (todos, incluyendo el nuevo bloque).

- [ ] **Step 5: Commit**

```bash
git add lib/accounts.ts tests/accounts.test.ts
git commit -m "feat: getAccountsWithBalances — saldos por cuenta y patrimonio neto"
```

---

### Task 3: Server Actions (`lib/account-actions.ts`)

**Files:**
- Create: `lib/account-actions.ts`
- Test: `tests/account-actions.test.ts`

**Interfaces:**
- Consumes: `auth` de `@/lib/auth`; `accountSchema` de `@/lib/validators`; `createAccountForUser`, `archiveAccountForUser` de `@/lib/accounts`; `revalidatePath` de `next/cache`.
- Produces:
  - `createAccount(values: unknown): Promise<{ ok: true } | { ok: false; error: string }>`: valida con `accountSchema`, saca `userId` de `auth()`, crea, revalida `/cuentas`.
  - `archiveAccount(accountId: string): Promise<{ ok: true } | { ok: false; error: string }>`: saca `userId` de `auth()`, archiva, revalida `/cuentas`.

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/account-actions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const email = `action_${Date.now()}@growly.app`
let userId = ''

// auth() devuelve el usuario de prueba; revalidatePath es no-op en test
vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createAccount, archiveAccount } from '@/lib/account-actions'

describe.skipIf(!process.env.DATABASE_URL)('account actions', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Action Test', email } })
    userId = u.id
  })
  afterAll(async () => {
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('createAccount crea la cuenta del usuario autenticado', async () => {
    const res = await createAccount({
      name: 'Efectivo', type: 'CASH', currency: 'USD', colorHex: '#10B981', initialBalance: 50000,
    })
    expect(res.ok).toBe(true)
    const list = await prisma.account.findMany({ where: { userId } })
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('Efectivo')
  })

  it('createAccount rechaza datos inválidos', async () => {
    const res = await createAccount({ name: '', type: 'CASH' })
    expect(res.ok).toBe(false)
  })

  it('archiveAccount archiva la cuenta', async () => {
    const acc = await prisma.account.findFirst({ where: { userId } })
    const res = await archiveAccount(acc!.id)
    expect(res.ok).toBe(true)
    expect((await prisma.account.findFirst({ where: { userId, archived: false } }))).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/account-actions.test.ts`
Expected: FAIL (`Cannot find module '@/lib/account-actions'`).

- [ ] **Step 3: Implementar `lib/account-actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { accountSchema } from '@/lib/validators'
import { createAccountForUser, archiveAccountForUser } from '@/lib/accounts'

export async function createAccount(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsed = accountSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  await createAccountForUser(session.user.id, parsed.data)
  revalidatePath('/cuentas')
  return { ok: true as const }
}

export async function archiveAccount(accountId: string) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  await archiveAccountForUser(session.user.id, accountId)
  revalidatePath('/cuentas')
  return { ok: true as const }
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/account-actions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/account-actions.ts tests/account-actions.test.ts
git commit -m "feat: server actions de cuentas (createAccount, archiveAccount)"
```

---

### Task 4: Componentes de presentación (`account-row`, `credit-card`)

**Files:**
- Create: `components/growly/account-row.tsx`, `components/growly/credit-card.tsx`
- Test: `tests/account-components.test.tsx`

**Interfaces:**
- Consumes: `Money` de `@/components/growly/money`; `formatMoney` de `@/lib/money`; `cn` de `@/lib/utils`; `lucide-react` iconos.
- Produces:
  - `<AccountRow name={string} subtitle={string} balance={number} icon?={ReactNode} />`: fila con nombre, subtítulo (banco) e importe (`<Money>`).
  - `<CreditCardView name={string} used={number} limit={number} pct={number} />`: tarjeta oscura con `····` genérico, saldo usado, límite e indicador de utilización (barra + %); el % en `text-destructive` si `pct >= 90`, si no en blanco.

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/account-components.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AccountRow } from '@/components/growly/account-row'
import { CreditCardView } from '@/components/growly/credit-card'

describe('<AccountRow>', () => {
  it('muestra nombre, subtítulo e importe', () => {
    render(<AccountRow name="Cuenta corriente" subtitle="BBVA" balance={1234000} />)
    expect(screen.getByText('Cuenta corriente')).toBeInTheDocument()
    expect(screen.getByText('BBVA')).toBeInTheDocument()
    expect(screen.getByText('$12,340.00')).toBeInTheDocument()
  })
})

describe('<CreditCardView>', () => {
  it('muestra nombre, saldo usado, límite y % de utilización', () => {
    render(<CreditCardView name="Growly Visa" used={64000} limit={300000} pct={21} />)
    expect(screen.getByText('Growly Visa')).toBeInTheDocument()
    expect(screen.getByText('$640.00')).toBeInTheDocument()
    expect(screen.getByText('21%')).toBeInTheDocument()
  })
  it('marca en rojo la utilización alta', () => {
    render(<CreditCardView name="X" used={280000} limit={300000} pct={93} />)
    expect(screen.getByText('93%').className).toContain('text-destructive')
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/account-components.test.tsx`
Expected: FAIL (módulos no existen).

- [ ] **Step 3: Implementar los componentes**

Create `components/growly/account-row.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Wallet } from 'lucide-react'
import { Money } from '@/components/growly/money'

export function AccountRow({
  name, subtitle, balance, icon,
}: {
  name: string
  subtitle: string
  balance: number
  icon?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon ?? <Wallet size={20} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-foreground">{name}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <Money cents={balance} className="text-base font-extrabold text-foreground" />
    </div>
  )
}
```

Create `components/growly/credit-card.tsx`:

```tsx
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

export function CreditCardView({
  name, used, limit, pct,
}: {
  name: string
  used: number
  limit: number
  pct: number
}) {
  const high = pct >= 90
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-forest p-6 text-white shadow-[0_16px_34px_-14px_rgba(18,33,28,.55)]">
      <div className="absolute -right-5 -top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,.3),transparent_70%)]" />
      <div className="mb-8 flex items-start justify-between">
        <span className="text-sm font-extrabold tracking-wide">{name}</span>
        <div className="h-5 w-8 rounded bg-white/15" />
      </div>
      <div className="mb-4 font-mono text-base tracking-[3px] text-white/90">···· ···· ···· ····</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[10px] text-white/50">Saldo usado</div>
          <div className="text-lg font-extrabold">{formatMoney(used)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-white/50">Límite</div>
          <div className="text-sm font-bold text-white/85">{formatMoney(limit, { withCents: false })}</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <div className="mt-1.5 text-right">
          <span className={cn('text-xs font-bold', high ? 'text-destructive' : 'text-white')}>{pct}%</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/account-components.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/growly/account-row.tsx components/growly/credit-card.tsx tests/account-components.test.tsx
git commit -m "feat: componentes AccountRow y CreditCardView"
```

---

### Task 5: Diálogo de alta (`account-dialog.tsx`)

**Files:**
- Create: `components/growly/account-dialog.tsx`
- Modify: `package.json`/`components/ui` (instalar el primitivo dialog)
- Test: `tests/account-dialog.test.tsx`

**Interfaces:**
- Consumes: el componente `Dialog` de shadcn/Base UI; `Button`, `Input`, `Label`; `createAccount` de `@/lib/account-actions`; `parseAmountToCents` de `@/lib/money`.
- Produces: `<AccountDialog />`, botón "Añadir cuenta" que abre un diálogo con el formulario (nombre, banco, tipo con `<select>` nativo estilizado, saldo inicial; si tipo = `CREDIT_CARD`, muestra también límite). Al enviar llama a `createAccount` con los importes convertidos a centavos vía `parseAmountToCents`; cierra en éxito.

- [ ] **Step 1: Instalar el primitivo dialog**

```bash
npx shadcn@latest add dialog --yes
```

(Genera `components/ui/dialog.tsx` sobre Base UI. Si el CLI difiere, seguir la skill `vercel:shadcn`; el objetivo es un `Dialog`/`DialogTrigger`/`DialogContent` usable.)

- [ ] **Step 2: Escribir el test (debe fallar)**

Create `tests/account-dialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/account-actions', () => ({ createAccount: vi.fn(async () => ({ ok: true })) }))
import { AccountDialog } from '@/components/growly/account-dialog'

describe('<AccountDialog>', () => {
  it('abre el diálogo con el formulario al pulsar el botón', async () => {
    render(<AccountDialog />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir cuenta/i }))
    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Saldo inicial')).toBeInTheDocument()
  })

  it('muestra el campo de límite solo para tarjeta de crédito', async () => {
    render(<AccountDialog />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir cuenta/i }))
    expect(screen.queryByLabelText('Límite de crédito')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'CREDIT_CARD')
    expect(screen.getByLabelText('Límite de crédito')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Ejecutar y ver fallar**

Run: `npm test -- tests/account-dialog.test.tsx`
Expected: FAIL (`Cannot find module '@/components/growly/account-dialog'`).

- [ ] **Step 4: Implementar `components/growly/account-dialog.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import {
  Dialog, DialogTrigger, DialogContent, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createAccount } from '@/lib/account-actions'
import { parseAmountToCents } from '@/lib/money'

const TYPES = [
  { value: 'CHECKING', label: 'Cuenta corriente' },
  { value: 'SAVINGS', label: 'Ahorros' },
  { value: 'CASH', label: 'Efectivo' },
  { value: 'CREDIT_CARD', label: 'Tarjeta de crédito' },
] as const

export function AccountDialog() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('CHECKING')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true); setError(null)
    const fd = new FormData(e.currentTarget)
    const initialBalance = parseAmountToCents(String(fd.get('initialBalance') ?? '')) ?? 0
    const limitRaw = fd.get('creditLimit')
    const creditLimit = type === 'CREDIT_CARD' && limitRaw
      ? parseAmountToCents(String(limitRaw))
      : null

    const res = await createAccount({
      name: String(fd.get('name') ?? ''),
      bankName: String(fd.get('bankName') ?? ''),
      type,
      currency: 'USD',
      colorHex: '#10B981',
      initialBalance,
      creditLimit,
    })
    setLoading(false)
    if (!res.ok) { setError(res.error); return }
    setOpen(false); setType('CHECKING')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="h-11 font-extrabold">
            <Plus size={18} /> Añadir cuenta
          </Button>
        }
      />
      <DialogContent className="w-full max-w-[420px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">Nueva cuenta</DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
            <Label htmlFor="bankName">Banco</Label>
            <Input id="bankName" name="bankName" />
          </div>
          <div>
            <Label htmlFor="type">Tipo</Label>
            <select
              id="type" name="type" value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
              className="h-11 w-full rounded-md border border-input bg-field px-3 text-sm"
            >
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="initialBalance">Saldo inicial</Label>
            <Input id="initialBalance" name="initialBalance" inputMode="decimal" placeholder="0.00" />
          </div>
          {type === 'CREDIT_CARD' && (
            <div>
              <Label htmlFor="creditLimit">Límite de crédito</Label>
              <Input id="creditLimit" name="creditLimit" inputMode="decimal" placeholder="0.00" />
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-2 h-11 font-extrabold">
            Crear cuenta
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

> Nota para el implementador: la API exacta de `Dialog`/`DialogTrigger` (prop `render` vs `asChild`, `open`/`onOpenChange`) depende de la versión shadcn/Base UI instalada. Ajusta a la API real del `components/ui/dialog.tsx` generado; el comportamiento requerido es: botón "Añadir cuenta" abre el diálogo, el formulario tiene los labels exactos (`Nombre`, `Banco`, `Tipo`, `Saldo inicial`, `Límite de crédito`), y `Límite de crédito` solo aparece con tipo `CREDIT_CARD`.

- [ ] **Step 5: Ejecutar y ver pasar**

Run: `npm test -- tests/account-dialog.test.tsx`
Expected: PASS (2 tests). Si Base UI no monta bien en jsdom, ajusta el import/props del dialog hasta que el diálogo abra en el test.

- [ ] **Step 6: Commit**

```bash
git add components/growly/account-dialog.tsx components/ui/dialog.tsx package.json package-lock.json tests/account-dialog.test.tsx
git commit -m "feat: diálogo de alta de cuenta (Base UI)"
```

---

### Task 6: Página `/cuentas` real + e2e

**Files:**
- Modify: `app/(app)/cuentas/page.tsx` (reemplaza el `ComingSoon`)
- Test: `tests/e2e/cuentas.spec.ts`

**Interfaces:**
- Consumes: `auth` de `@/lib/auth`; `getAccountsWithBalances` de `@/lib/accounts`; `Money`, `AccountRow`, `CreditCardView`, `AccountDialog`; `formatMoney`.
- Produces: la página `/cuentas`, cabecera "Patrimonio neto" (grande, centrada), botón `<AccountDialog/>`, sección "CUENTAS" (cuentas no-tarjeta con `<AccountRow>`), sección "TARJETAS" (`<CreditCardView>` por cada `CREDIT_CARD`), estado vacío si no hay cuentas.

- [ ] **Step 1: Implementar `app/(app)/cuentas/page.tsx`**

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAccountsWithBalances } from '@/lib/accounts'
import { Money } from '@/components/growly/money'
import { AccountRow } from '@/components/growly/account-row'
import { CreditCardView } from '@/components/growly/credit-card'
import { AccountDialog } from '@/components/growly/account-dialog'

export default async function CuentasPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { accounts, netWorth } = await getAccountsWithBalances(session.user.id)
  const cuentas = accounts.filter((a) => a.type !== 'CREDIT_CARD')
  const tarjetas = accounts.filter((a) => a.type === 'CREDIT_CARD')

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Cuentas y tarjetas</h1>
          <div className="mt-1 text-sm text-muted-foreground">Patrimonio neto</div>
          <Money cents={netWorth} className="text-[34px] font-extrabold tracking-[-0.02em]" />
        </div>
        <AccountDialog />
      </div>

      {accounts.length === 0 && (
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">Aún no tienes cuentas. Añade la primera.</p>
        </div>
      )}

      {cuentas.length > 0 && (
        <>
          <div className="mb-2 mt-4 px-1 text-xs font-extrabold tracking-wide text-muted-foreground">CUENTAS</div>
          <div className="divide-y divide-[var(--line)] rounded-[22px] border border-border bg-card px-5 shadow-[var(--shadow-card)]">
            {cuentas.map((a) => (
              <AccountRow key={a.id} name={a.name} subtitle={a.bankName ?? ''} balance={a.balance} />
            ))}
          </div>
        </>
      )}

      {tarjetas.length > 0 && (
        <>
          <div className="mb-2 mt-6 px-1 text-xs font-extrabold tracking-wide text-muted-foreground">TARJETAS</div>
          <div className="flex flex-col gap-3">
            {tarjetas.map((a) => (
              <CreditCardView
                key={a.id}
                name={a.name}
                used={a.utilization!.used}
                limit={a.creditLimit ?? 0}
                pct={a.utilization!.pct}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Escribir el e2e**

Create `tests/e2e/cuentas.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('crear una cuenta y verla en /cuentas con el patrimonio actualizado', async ({ page }) => {
  // usuario fresco para estado limpio
  const email = `e2e_cuentas_${Date.now()}@growly.app`
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Cuentas')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Efectivo')
  await page.getByLabel('Saldo inicial').fill('1500')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  await expect(page.getByText('Efectivo')).toBeVisible()
  await expect(page.getByText('$1,500.00').first()).toBeVisible()
})
```

- [ ] **Step 3: Ejecutar unidad + build + e2e**

Run: `npm test` → toda la suite verde (unidad).
Run: `npm run build` → limpio (la página `/cuentas` compila; ya no usa `ComingSoon`).
Run: `npm run test:e2e` → los dos specs (auth + cuentas) pasan.

- [ ] **Step 4: Verificación manual (nice to have)**

`npm run dev` → login → `/cuentas` → "Añadir cuenta" → crea una cuenta corriente y una tarjeta → confirma que se listan, el patrimonio neto suma correcto y la tarjeta muestra su % de utilización. Compara con el diseño "Cuentas y tarjetas".

- [ ] **Step 5: Commit**

```bash
git add app/(app)/cuentas/page.tsx tests/e2e/cuentas.spec.ts
git commit -m "feat: página /cuentas real (patrimonio neto, cuentas y tarjetas)"
```

---

## Self-Review (cobertura vs. spec)

- **Gestión de cuentas (spec §Cuentas):** nombre, banco, tipo, saldo, moneda, color → `accountSchema` + `createAccountForUser` (Tasks 1, 3, 5). Historial y transferencias entre cuentas → B3 (movimientos). ✅ (alcance)
- **Gestión de tarjetas (spec §Tarjetas):** límite, saldo utilizado, disponible, corte/pago (campos en schema), utilización + indicador de riesgo → `cardUtilization` + `<CreditCardView>` (Tasks 2, 4, 6). Alertas automáticas → Fase 3. ✅ (alcance)
- **Patrimonio neto (spec §4 semántica):** `getAccountsWithBalances.netWorth` + cabecera (Tasks 2, 6). ✅
- **Multi-tenant/seguridad (spec §7):** todo por `userId` de `auth()`; `updateMany` con filtro `userId` (Tasks 1, 3). ✅
- **Diseño (spec §8):** tokens, tarjeta oscura `bg-forest`, diálogo Base UI (Tasks 4, 5, 6). ✅
- **Consistencia de tipos:** `AccountFormValues` (Task 1) usado por `createAccountForUser`/`createAccount` (Tasks 1, 3, 5); `AccountWithBalance` (Task 2) consumido por la página (Task 6); `cardUtilization` firma de B1 reusada. Sin placeholders. ✅

**Fuera de alcance de B2 (van en B3/B4):** movimientos/transferencias (los saldos se recalculan solos cuando existan), editar cuenta (solo crear/archivar en B2), el Dashboard. **Nota:** el schema no guarda número de cuenta/tarjeta → subtítulo = banco, tarjeta con `····` genérico (adaptación fiel al modelo de datos, no un hueco).
