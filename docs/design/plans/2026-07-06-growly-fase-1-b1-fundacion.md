# Growly Fase 1 · B1: Fundación (dinero + saldos) · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la capa de lógica pura del núcleo financiero, formateo de dinero (centavos ↔ display), cálculo de saldos/patrimonio/utilización de tarjeta, y los componentes de visualización de importes, todo con TDD, sin tocar base de datos ni UI de páginas todavía.

**Architecture:** Funciones puras en `lib/money.ts` y `lib/balances.ts` que operan sobre objetos planos (estructuralmente compatibles con los modelos de Prisma, pero sin depender de él), más componentes de presentación en `components/growly/money.tsx`. Al ser puras, se prueban exhaustivamente sin DB. B2 (Cuentas), B3 (Movimientos) y B4 (Dashboard) consumen esta base.

**Tech Stack:** TypeScript, Vitest + React Testing Library, TailwindCSS v4 (tokens ya definidos), `@/lib/utils` `cn` (de shadcn).

## Global Constraints

- **Dinero = `Int` en centavos** siempre. Nunca `Float`. Todo formateo pasa por `lib/money.ts`.
- **Formato numérico `en-US`** (agrupación con coma, decimal con punto: `$18,240.00`) aunque el texto de la UI sea español, así lo muestran los diseños. Símbolo por moneda vía `Intl`, **default `USD` (`$`)**, **sin conversión FX**.
- **Semántica de saldo:** `accountBalance` cuenta SOLO movimientos con `status !== 'PENDING'` (CLEARED o sin estado). Los `PENDING` con fecha futura son "próximos pagos" / dinero comprometido, NO parte del saldo disponible.
- **Funciones puras:** nada de `Date.now()`/`Math.random()`/`new Date()` sin argumento dentro de la lógica; cualquier "ahora" se pasa como parámetro.
- **Tokens de color:** ingresos en `text-acc` (verde), gastos en `text-foreground` (neutro), según el diseño (el gasto NO va en rojo).
- **Tests:** Vitest, TDD (RED→GREEN). Commits en español, estilo `feat:`/`test:`.
- **TypeScript estricto:** sin `any` implícito; tipos de entrada explícitos.

---

## Estructura de archivos (B1)

```
lib/
├─ money.ts        formateo y parseo de dinero (centavos ↔ display)
└─ balances.ts     cálculo puro: saldo de cuenta, utilización de tarjeta, patrimonio neto
components/growly/
└─ money.tsx       <Money> (importe formateado) y <SignedAmount> (con signo + color)
tests/
├─ money.test.ts
├─ balances.test.ts
└─ money-component.test.tsx
```

---

### Task 1: `lib/money.ts`, formateo y parseo de dinero

**Files:**
- Create: `lib/money.ts`
- Test: `tests/money.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `formatMoney(cents: number, opts?: { withCents?: boolean; currency?: string }): string`: devuelve la **magnitud** formateada (sin signo), p. ej. `formatMoney(1824000)` → `"$18,240.00"`, `formatMoney(1824000, { withCents: false })` → `"$18,240"`. `withCents` default `true`, `currency` default `'USD'`.
  - `toCents(amount: number): number`: `Math.round(amount * 100)`.
  - `fromCents(cents: number): number`: `cents / 100`.
  - `parseAmountToCents(input: string): number | null`: parsea `"1,234.56"`, `"$1,234.56"`, `"62.3"` → `123456`, `123456`, `6230`; devuelve `null` si no es un número positivo finito.

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/money.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatMoney, toCents, fromCents, parseAmountToCents } from '@/lib/money'

describe('formatMoney', () => {
  it('formatea con centavos y separador de miles', () => {
    expect(formatMoney(1824000)).toBe('$18,240.00')
  })
  it('omite centavos con withCents:false', () => {
    expect(formatMoney(1824000, { withCents: false })).toBe('$18,240')
  })
  it('devuelve la magnitud (sin signo) para negativos', () => {
    expect(formatMoney(-6230)).toBe('$62.30')
  })
  it('respeta otra moneda', () => {
    expect(formatMoney(100000, { currency: 'EUR' })).toBe('€1,000.00')
  })
})

describe('toCents / fromCents', () => {
  it('convierte a centavos redondeando', () => {
    expect(toCents(62.3)).toBe(6230)
    expect(toCents(0.1 + 0.2)).toBe(30) // sin errores de coma flotante
  })
  it('convierte desde centavos', () => {
    expect(fromCents(6230)).toBe(62.3)
  })
})

describe('parseAmountToCents', () => {
  it('parsea con símbolo y comas', () => {
    expect(parseAmountToCents('$1,234.56')).toBe(123456)
    expect(parseAmountToCents('62.3')).toBe(6230)
  })
  it('rechaza entradas inválidas', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('-5')).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/money.test.ts`
Expected: FAIL (`Cannot find module '@/lib/money'`).

- [ ] **Step 3: Implementar `lib/money.ts`**

```ts
export function formatMoney(
  cents: number,
  opts: { withCents?: boolean; currency?: string } = {},
): string {
  const { withCents = true, currency = 'USD' } = opts
  const value = Math.abs(cents) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  }).format(value)
}

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '') // quita símbolos, comas, espacios, signos
  if (cleaned === '' || input.trim().startsWith('-')) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/money.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/money.ts tests/money.test.ts
git commit -m "feat: lib/money — formateo y parseo de dinero en centavos"
```

---

### Task 2: `lib/balances.ts`, saldos, utilización de tarjeta y patrimonio neto

**Files:**
- Create: `lib/balances.ts`
- Test: `tests/balances.test.ts`

**Interfaces:**
- Consumes: nada (opera sobre objetos planos).
- Produces:
  - Tipos `TxInput` y `AccountInput` (abajo).
  - `accountBalance(account: AccountInput, txns: TxInput[]): number`: `initialBalance` + entradas − salidas de los movimientos **CLEARED** (ignora `PENDING`). INCOME suma, EXPENSE resta, TRANSFER resta de la cuenta origen (`accountId`) y suma a la destino (`transferAccountId`).
  - `cardUsed(card: AccountInput, txns: TxInput[]): number`: deuda usada de una tarjeta = `initialBalance` + Σ(EXPENSE con `accountId`===tarjeta) − Σ(TRANSFER con `transferAccountId`===tarjeta) [pagos]. Solo CLEARED.
  - `cardUtilization(card: AccountInput, txns: TxInput[]): { used: number; available: number; pct: number }`: `available = (creditLimit ?? 0) − used`; `pct = creditLimit ? redondear(used/creditLimit*100): 0`.
  - `netWorth(accounts: AccountInput[], txns: TxInput[]): number`: Σ(`accountBalance` de cuentas no-tarjeta) − Σ(`cardUsed` de tarjetas).

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/balances.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  accountBalance, cardUsed, cardUtilization, netWorth,
  type AccountInput, type TxInput,
} from '@/lib/balances'

const checking: AccountInput = { id: 'a1', type: 'CHECKING', initialBalance: 1000000 } // $10,000
const savings: AccountInput = { id: 'a2', type: 'SAVINGS', initialBalance: 800000 }   // $8,000
const card: AccountInput = { id: 'c1', type: 'CREDIT_CARD', initialBalance: 0, creditLimit: 300000 } // límite $3,000

describe('accountBalance', () => {
  it('suma ingresos y resta gastos (solo CLEARED)', () => {
    const txns: TxInput[] = [
      { type: 'INCOME', amount: 306000, accountId: 'a1', status: 'CLEARED' },
      { type: 'EXPENSE', amount: 6230, accountId: 'a1', status: 'CLEARED' },
      { type: 'EXPENSE', amount: 120000, accountId: 'a1', status: 'PENDING' }, // ignorado
    ]
    expect(accountBalance(checking, txns)).toBe(1000000 + 306000 - 6230)
  })
  it('aplica transferencias en ambas cuentas', () => {
    const txns: TxInput[] = [
      { type: 'TRANSFER', amount: 50000, accountId: 'a1', transferAccountId: 'a2' },
    ]
    expect(accountBalance(checking, txns)).toBe(1000000 - 50000)
    expect(accountBalance(savings, txns)).toBe(800000 + 50000)
  })
})

describe('tarjeta de crédito', () => {
  it('cardUsed = gastos − pagos', () => {
    const txns: TxInput[] = [
      { type: 'EXPENSE', amount: 64000, accountId: 'c1' },           // gasto $640
      { type: 'TRANSFER', amount: 20000, accountId: 'a1', transferAccountId: 'c1' }, // pago $200
    ]
    expect(cardUsed(card, txns)).toBe(64000 - 20000) // $440
  })
  it('cardUtilization calcula disponible y porcentaje', () => {
    const txns: TxInput[] = [{ type: 'EXPENSE', amount: 150000, accountId: 'c1' }] // $1,500 de $3,000
    expect(cardUtilization(card, txns)).toEqual({ used: 150000, available: 150000, pct: 50 })
  })
})

describe('netWorth', () => {
  it('suma cuentas y resta deuda de tarjetas', () => {
    const txns: TxInput[] = [{ type: 'EXPENSE', amount: 64000, accountId: 'c1' }] // deuda $640
    // checking $10,000 + savings $8,000 - deuda $640 = $17,360
    expect(netWorth([checking, savings, card], txns)).toBe(1000000 + 800000 - 64000)
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/balances.test.ts`
Expected: FAIL (`Cannot find module '@/lib/balances'`).

- [ ] **Step 3: Implementar `lib/balances.ts`**

```ts
export type AccountType = 'CHECKING' | 'SAVINGS' | 'CASH' | 'CREDIT_CARD'

export type AccountInput = {
  id: string
  type: AccountType
  initialBalance: number       // centavos
  creditLimit?: number | null  // centavos, solo tarjetas
}

export type TxInput = {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  amount: number               // centavos, positivo
  accountId: string
  transferAccountId?: string | null
  status?: 'CLEARED' | 'PENDING'
}

const isCleared = (t: TxInput) => t.status !== 'PENDING'

export function accountBalance(account: AccountInput, txns: TxInput[]): number {
  let balance = account.initialBalance
  for (const t of txns) {
    if (!isCleared(t)) continue
    if (t.accountId === account.id) {
      if (t.type === 'INCOME') balance += t.amount
      else balance -= t.amount // EXPENSE o TRANSFER saliente
    } else if (t.type === 'TRANSFER' && t.transferAccountId === account.id) {
      balance += t.amount // transferencia entrante
    }
  }
  return balance
}

export function cardUsed(card: AccountInput, txns: TxInput[]): number {
  let used = card.initialBalance
  for (const t of txns) {
    if (!isCleared(t)) continue
    if (t.type === 'EXPENSE' && t.accountId === card.id) used += t.amount
    else if (t.type === 'TRANSFER' && t.transferAccountId === card.id) used -= t.amount // pago
  }
  return used
}

export function cardUtilization(
  card: AccountInput,
  txns: TxInput[],
): { used: number; available: number; pct: number } {
  const used = cardUsed(card, txns)
  const limit = card.creditLimit ?? 0
  const available = limit - used
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0
  return { used, available, pct }
}

export function netWorth(accounts: AccountInput[], txns: TxInput[]): number {
  let total = 0
  for (const a of accounts) {
    if (a.type === 'CREDIT_CARD') total -= cardUsed(a, txns)
    else total += accountBalance(a, txns)
  }
  return total
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/balances.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/balances.ts tests/balances.test.ts
git commit -m "feat: lib/balances — saldo, utilización de tarjeta y patrimonio neto"
```

---

### Task 3: `components/growly/money.tsx`, `<Money>` y `<SignedAmount>`

**Files:**
- Create: `components/growly/money.tsx`
- Test: `tests/money-component.test.tsx`

**Interfaces:**
- Consumes: `formatMoney` de `@/lib/money`; `cn` de `@/lib/utils` (helper de shadcn ya existente).
- Produces:
  - `<Money cents={number} withCents?={boolean} currency?={string} className?={string} />`: renderiza un `<span>` con la magnitud formateada.
  - `<SignedAmount cents={number} currency?={string} className?={string} />`: renderiza un `<span>` con signo (`+`/`−`) y color: `cents >= 0` → `text-acc` con `+`; `cents < 0` → `text-foreground` con `−`. La magnitud viene de `formatMoney`.

- [ ] **Step 1: Escribir el test (debe fallar)**

Create `tests/money-component.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Money, SignedAmount } from '@/components/growly/money'

describe('<Money>', () => {
  it('renderiza el importe formateado', () => {
    render(<Money cents={1824000} />)
    expect(screen.getByText('$18,240.00')).toBeInTheDocument()
  })
  it('omite centavos con withCents=false', () => {
    render(<Money cents={1824000} withCents={false} />)
    expect(screen.getByText('$18,240')).toBeInTheDocument()
  })
})

describe('<SignedAmount>', () => {
  it('ingreso: signo + y color de acento', () => {
    render(<SignedAmount cents={306000} />)
    const el = screen.getByText('+$3,060.00')
    expect(el.className).toContain('text-acc')
  })
  it('gasto: signo − y color neutro', () => {
    render(<SignedAmount cents={-6230} />)
    const el = screen.getByText('−$62.30')
    expect(el.className).toContain('text-foreground')
  })
})
```

- [ ] **Step 2: Ejecutar y ver fallar**

Run: `npm test -- tests/money-component.test.tsx`
Expected: FAIL (`Cannot find module '@/components/growly/money'`).

- [ ] **Step 3: Implementar `components/growly/money.tsx`**

```tsx
import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

export function Money({
  cents,
  withCents = true,
  currency = 'USD',
  className,
}: {
  cents: number
  withCents?: boolean
  currency?: string
  className?: string
}) {
  return <span className={className}>{formatMoney(cents, { withCents, currency })}</span>
}

export function SignedAmount({
  cents,
  currency = 'USD',
  className,
}: {
  cents: number
  currency?: string
  className?: string
}) {
  const positive = cents >= 0
  const glyph = positive ? '+' : '−' // U+2212 minus, coherente con los diseños
  return (
    <span className={cn(positive ? 'text-acc' : 'text-foreground', className)}>
      {glyph}
      {formatMoney(cents, { currency })}
    </span>
  )
}
```

- [ ] **Step 4: Ejecutar y ver pasar**

Run: `npm test -- tests/money-component.test.tsx`
Expected: PASS (todos).

- [ ] **Step 5: Verificar la suite completa**

Run: `npm test`
Expected: toda la suite verde (los nuevos tests + los de Fase 0), salida limpia.

- [ ] **Step 6: Commit**

```bash
git add components/growly/money.tsx tests/money-component.test.tsx
git commit -m "feat: componentes <Money> y <SignedAmount>"
```

---

## Self-Review (cobertura vs. spec)

- **Dinero en centavos + formateo (spec §4, §11.2):** `lib/money.ts` → Task 1. ✅
- **Saldo calculado, no mutado (spec §4 semántica, §11.3):** `accountBalance`/`netWorth` recomputan desde los movimientos → Task 2. ✅
- **Cuenta/tarjeta unificadas + utilización de riesgo (spec §4, gestión de tarjetas):** `cardUsed`/`cardUtilization` → Task 2. ✅
- **Próximos pagos = PENDING (spec §11.5):** la exclusión de `PENDING` del saldo lo habilita; el filtro de "próximos pagos" en sí se implementa en B4 (Dashboard) donde se usa. ✅ (nota de alcance)
- **Componentes reutilizables / diseño (spec §8):** `<Money>`/`<SignedAmount>` con tokens `text-acc`/`text-foreground` → Task 3. ✅
- **Sin placeholders / consistencia de tipos:** `TxInput`/`AccountInput` definidos en Task 2 se usan consistentes; `formatMoney` firma idéntica en Tasks 1 y 3. ✅

**Fuera de alcance de B1 (van en B2/B3/B4):** agregaciones de dashboard (`categoryTotals`, `upcomingPayments`, totales mensuales), CRUD de cuentas/movimientos, el diálogo "Añadir", y la UI de páginas. Se construyen sobre esta base.
