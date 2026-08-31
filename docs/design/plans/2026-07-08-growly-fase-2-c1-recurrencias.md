# Growly Fase 2 · C1: Recurrencias · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Motor de recurrencias: reglas (Netflix cada mes, nómina cada quincena) que se materializan como movimientos `PENDING` a 90 días vista, con confirmación manual de vencidos y gestión en una pestaña "Recurrentes" de `/movimientos`.

**Architecture:** Materialización perezosa e idempotente al leer (sin cron): `lib/recurrence.ts` calcula fechas (puro), `lib/recurring.ts` persiste (scoped por `userId`), `lib/recurring-actions.ts` expone server actions con `auth()` + Zod + ownership. Los `PENDING` generados alimentan sin cambios el dashboard existente (próximos pagos, comprometido).

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Prisma 6.19.3 + Neon PostgreSQL, Zod, shadcn/ui sobre Base UI (`base-nova`), Vitest + RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-08-growly-fase-2-design.md` (secciones 4, 5, 10, 11).

## Global Constraints

- **Dinero:** siempre centavos `Int`. Nunca Float. Formateo con `formatMoney`/`<Money>`/`<SignedAmount>` existentes.
- **Multi-tenant:** todo acceso a datos va scoped por `userId` obtenido de `auth()` en la action/página. Jamás un `userId` del cliente. Mutaciones sobre recursos existentes con `updateMany`/`deleteMany` + `where: { id, userId }`.
- **Convención de fechas (igual que Fase 1):** los inputs `type=date` producen `YYYY-MM-DD` → `z.coerce.date()` → medianoche UTC. La aritmética de recurrencia usa getters/setters **UTC** (`getUTCDate`, `setUTCFullYear`…) para ser determinista. Comparaciones por `getTime()`.
- **UI en español**, tokens del design system ya definidos en `app/globals.css` (clases `bg-card`, `text-muted-foreground`, `bg-forest`, `text-destructive`, `shadow-[var(--shadow-card)]`, radios `rounded-[11px]`/`rounded-[22px]`).
- **Diálogos:** shadcn sobre **Base UI**, `DialogTrigger` usa la prop `render={<elemento/>}` (NO children), `Dialog` controlado con `open`/`onOpenChange`. Copiar el patrón de `components/growly/transaction-dialog.tsx`.
- **Next.js 16:** `searchParams` es `Promise` y se hace `await`. Este repo usa una versión de Next con breaking changes, ante cualquier duda de API, leer `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- **Prisma pinned a 6.19.3**: no actualizar dependencias.
- **`.env` es local y gitignored** (contiene `DATABASE_URL` de Neon y `AUTH_SECRET`). NO modificarlo, NO imprimirlo, NO commitearlo.
- **Tests de DB:** patrón `describe.skipIf(!process.env.DATABASE_URL)`, email único por archivo (`` `algo_${Date.now()}@growly.app` ``), cleanup en `afterAll` scoped al usuario del test. `tests/setup.ts` ya carga dotenv y desconecta prisma.
- **Comandos** (Windows PowerShell): `npx vitest run <archivo>` para unit, `npx playwright test <archivo>` para e2e (levanta `next dev` solo), `npx prisma migrate dev` para migraciones.
- Commits frecuentes con mensajes `feat:`/`test:`/`fix:` en español, como el historial existente.

---

### Task 1: Schema Prisma, `RecurringRule` + `Transaction.recurringRuleId` + migración

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/recurring-schema.test.ts`

**Interfaces:**
- Consumes: modelos existentes `User`, `Account`, `Category`, `Transaction`, enum `TransactionType`.
- Produces: enum `RecurrenceFrequency` (`WEEKLY|BIWEEKLY|MONTHLY|YEARLY`), modelo `RecurringRule` (campos: `id`, `userId`, `accountId`, `categoryId?`, `type`, `amount`, `description`, `frequency`, `startDate`, `endDate?`, `active`, `materializedThrough?`, `createdAt`, `updatedAt`), campo `Transaction.recurringRuleId?` con `@@unique([recurringRuleId, date])`. Tasks 3-4 dependen de estos nombres exactos.

- [ ] **Step 1: Escribir el test (falla porque el modelo no existe)**

Crear `tests/recurring-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('schema RecurringRule', () => {
  it('el cliente expone recurringRule', async () => {
    const count = await prisma.recurringRule.count()
    expect(typeof count).toBe('number')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run tests/recurring-schema.test.ts`
Expected: FAIL, `prisma.recurringRule` es `undefined` (TypeError) o error de tipo.

- [ ] **Step 3: Añadir el schema**

En `prisma/schema.prisma`:

1. Añadir al final del archivo:

```prisma
enum RecurrenceFrequency {
  WEEKLY
  BIWEEKLY
  MONTHLY
  YEARLY
}

model RecurringRule {
  id                  String              @id @default(cuid())
  userId              String
  accountId           String
  categoryId          String?
  type                TransactionType
  amount              Int
  description         String
  frequency           RecurrenceFrequency
  startDate           DateTime
  endDate             DateTime?
  active              Boolean             @default(true)
  materializedThrough DateTime?
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  account      Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  category     Category?     @relation(fields: [categoryId], references: [id])
  transactions Transaction[]
  @@index([userId])
}
```

2. En `model Transaction`, añadir tras la línea `transferAccountId String?`:

```prisma
  recurringRuleId   String?
```

y junto a las relaciones existentes (tras la línea de `category`):

```prisma
  recurringRule   RecurringRule? @relation(fields: [recurringRuleId], references: [id], onDelete: SetNull)
```

y junto a los `@@index` existentes de Transaction:

```prisma
  @@unique([recurringRuleId, date])
```

(La unique con columna nullable no afecta a los movimientos normales: Postgres trata los NULL como distintos. Protege contra doble materialización concurrente, junto con `skipDuplicates` en Task 3.)

3. Relaciones inversas: añadir una línea en cada modelo:
   - `model User`: `recurringRules RecurringRule[]`
   - `model Account`: `recurringRules RecurringRule[]`
   - `model Category`: `recurringRules RecurringRule[]`

- [ ] **Step 4: Validar y migrar**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid`

Run: `npx prisma migrate dev --name recurring_rules`
Expected: `Your database is now in sync with your schema` + cliente regenerado. (Usa el `DATABASE_URL` de `.env`, no imprimir su valor.)

- [ ] **Step 5: Verificar que el test pasa**

Run: `npx vitest run tests/recurring-schema.test.ts`
Expected: PASS (1 test)

Run: `npx vitest run`
Expected: toda la suite existente sigue verde.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/recurring-schema.test.ts
git commit -m "feat: schema RecurringRule + Transaction.recurringRuleId (C1 recurrencias)"
```

---

### Task 2: `lib/recurrence.ts`, cálculo puro de ocurrencias

**Files:**
- Create: `lib/recurrence.ts`
- Test: `tests/recurrence.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro, sin prisma).
- Produces (Tasks 3, 6, 7 dependen de estas firmas exactas):
  - `type RecurrenceFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY'`
  - `type RecurrenceRuleInput = { frequency: RecurrenceFrequency; startDate: Date; endDate?: Date | null }`
  - `occurrenceAt(rule: RecurrenceRuleInput, n: number): Date`
  - `nextOccurrences(rule: RecurrenceRuleInput, fromExclusive: Date, toInclusive: Date): Date[]`
  - `nextDateForRule(rule: RecurrenceRuleInput, now: Date): Date | null`
  - `describeFrequency(rule: Pick<RecurrenceRuleInput, 'frequency' | 'startDate'>): string`
  - `addDaysUTC(d: Date, days: number): Date`
  - `formatShortDateUTC(d: Date): string` → `"12 ago"`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/recurrence.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  nextOccurrences, nextDateForRule, describeFrequency, addDaysUTC, formatShortDateUTC,
  type RecurrenceRuleInput,
} from '@/lib/recurrence'

const d = (s: string) => new Date(s) // 'YYYY-MM-DD' → medianoche UTC
const rule = (frequency: RecurrenceRuleInput['frequency'], start: string, end?: string): RecurrenceRuleInput =>
  ({ frequency, startDate: d(start), endDate: end ? d(end) : null })

describe('nextOccurrences', () => {
  it('MONTHLY normal: mismo día cada mes', () => {
    expect(nextOccurrences(rule('MONTHLY', '2026-01-15'), d('2025-12-31'), d('2026-03-31')))
      .toEqual([d('2026-01-15'), d('2026-02-15'), d('2026-03-15')])
  })

  it('MONTHLY anclada al 31: se ajusta al último día del mes sin deslizarse', () => {
    expect(nextOccurrences(rule('MONTHLY', '2026-01-31'), d('2026-01-01'), d('2026-04-30')))
      .toEqual([d('2026-01-31'), d('2026-02-28'), d('2026-03-31'), d('2026-04-30')])
  })

  it('MONTHLY anclada al 31 en año bisiesto: 29 feb', () => {
    expect(nextOccurrences(rule('MONTHLY', '2024-01-31'), d('2024-01-01'), d('2024-02-29')))
      .toEqual([d('2024-01-31'), d('2024-02-29')])
  })

  it('YEARLY anclada al 29 feb: en años no bisiestos cae el 28', () => {
    expect(nextOccurrences(rule('YEARLY', '2024-02-29'), d('2024-01-01'), d('2028-12-31')))
      .toEqual([d('2024-02-29'), d('2025-02-28'), d('2026-02-28'), d('2027-02-28'), d('2028-02-29')])
  })

  it('WEEKLY: cada 7 días', () => {
    expect(nextOccurrences(rule('WEEKLY', '2026-07-06'), d('2026-07-01'), d('2026-07-21')))
      .toEqual([d('2026-07-06'), d('2026-07-13'), d('2026-07-20')])
  })

  it('BIWEEKLY: cada 14 días', () => {
    expect(nextOccurrences(rule('BIWEEKLY', '2026-07-06'), d('2026-07-01'), d('2026-08-04')))
      .toEqual([d('2026-07-06'), d('2026-07-20'), d('2026-08-03')])
  })

  it('endDate es inclusive', () => {
    expect(nextOccurrences(rule('MONTHLY', '2026-01-15', '2026-02-15'), d('2026-01-01'), d('2026-06-30')))
      .toEqual([d('2026-01-15'), d('2026-02-15')])
  })

  it('fromExclusive excluye la ocurrencia exacta', () => {
    expect(nextOccurrences(rule('MONTHLY', '2026-01-15'), d('2026-01-15'), d('2026-02-28')))
      .toEqual([d('2026-02-15')])
  })

  it('rango sin ocurrencias → []', () => {
    expect(nextOccurrences(rule('MONTHLY', '2026-06-01'), d('2026-01-01'), d('2026-05-31'))).toEqual([])
  })
})

describe('nextDateForRule', () => {
  it('devuelve la primera ocurrencia futura', () => {
    expect(nextDateForRule(rule('MONTHLY', '2026-01-15'), d('2026-03-20'))).toEqual(d('2026-04-15'))
  })
  it('null si la serie terminó (endDate)', () => {
    expect(nextDateForRule(rule('MONTHLY', '2026-01-15', '2026-03-15'), d('2026-03-20'))).toBeNull()
  })
})

describe('describeFrequency', () => {
  it('etiquetas en español', () => {
    expect(describeFrequency(rule('MONTHLY', '2026-07-12'))).toBe('Cada mes · día 12')
    expect(describeFrequency(rule('WEEKLY', '2026-07-06'))).toBe('Cada semana · lunes')
    expect(describeFrequency(rule('BIWEEKLY', '2026-07-06'))).toBe('Cada 2 semanas · lunes')
    expect(describeFrequency(rule('YEARLY', '2026-12-24'))).toBe('Cada año · 24 dic')
  })
})

describe('helpers', () => {
  it('addDaysUTC suma días', () => {
    expect(addDaysUTC(d('2026-07-08'), 90)).toEqual(d('2026-10-06'))
  })
  it('formatShortDateUTC', () => {
    expect(formatShortDateUTC(d('2026-08-12'))).toBe('12 ago')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/recurrence.test.ts`
Expected: FAIL, `Cannot find module '@/lib/recurrence'`

- [ ] **Step 3: Implementar `lib/recurrence.ts`**

```ts
export type RecurrenceFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY'

export type RecurrenceRuleInput = {
  frequency: RecurrenceFrequency
  startDate: Date
  endDate?: Date | null
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const daysInMonthUTC = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

export function addDaysUTC(d: Date, days: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + days)
  return r
}

export function formatShortDateUTC(d: Date): string {
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

// n-ésima ocurrencia de la serie (n = 0 es startDate). Anclada a startDate:
// MONTHLY/YEARLY con ajuste de fin de mes (día 31 → 30/28/29, nunca se desliza de mes).
export function occurrenceAt(rule: RecurrenceRuleInput, n: number): Date {
  const s = rule.startDate
  switch (rule.frequency) {
    case 'WEEKLY':
      return addDaysUTC(s, 7 * n)
    case 'BIWEEKLY':
      return addDaysUTC(s, 14 * n)
    case 'MONTHLY': {
      const months = s.getUTCMonth() + n
      const y = s.getUTCFullYear() + Math.floor(months / 12)
      const m = ((months % 12) + 12) % 12
      const r = new Date(s)
      r.setUTCFullYear(y, m, Math.min(s.getUTCDate(), daysInMonthUTC(y, m)))
      return r
    }
    case 'YEARLY': {
      const y = s.getUTCFullYear() + n
      const r = new Date(s)
      r.setUTCFullYear(y, s.getUTCMonth(), Math.min(s.getUTCDate(), daysInMonthUTC(y, s.getUTCMonth())))
      return r
    }
  }
}

// Ocurrencias con fromExclusive < fecha <= min(toInclusive, endDate).
export function nextOccurrences(rule: RecurrenceRuleInput, fromExclusive: Date, toInclusive: Date): Date[] {
  const endMs = rule.endDate
    ? Math.min(rule.endDate.getTime(), toInclusive.getTime())
    : toInclusive.getTime()
  const out: Date[] = []
  for (let n = 0; ; n++) {
    const d = occurrenceAt(rule, n)
    if (d.getTime() > endMs) break
    if (d.getTime() > fromExclusive.getTime()) out.push(d)
  }
  return out
}

// Primera ocurrencia estrictamente futura, o null si la serie terminó.
export function nextDateForRule(rule: RecurrenceRuleInput, now: Date): Date | null {
  for (let n = 0; ; n++) {
    const d = occurrenceAt(rule, n)
    if (rule.endDate && d.getTime() > rule.endDate.getTime()) return null
    if (d.getTime() > now.getTime()) return d
  }
}

export function describeFrequency(rule: Pick<RecurrenceRuleInput, 'frequency' | 'startDate'>): string {
  const s = rule.startDate
  switch (rule.frequency) {
    case 'WEEKLY':
      return `Cada semana · ${DIAS[s.getUTCDay()]}`
    case 'BIWEEKLY':
      return `Cada 2 semanas · ${DIAS[s.getUTCDay()]}`
    case 'MONTHLY':
      return `Cada mes · día ${s.getUTCDate()}`
    case 'YEARLY':
      return `Cada año · ${s.getUTCDate()} ${MESES[s.getUTCMonth()]}`
  }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/recurrence.test.ts`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add lib/recurrence.ts tests/recurrence.test.ts
git commit -m "feat: lib/recurrence — cálculo puro de ocurrencias (fin de mes, bisiestos)"
```

---

### Task 3: `lib/recurring.ts`, materialización + confirmar

**Files:**
- Create: `lib/recurring.ts`
- Test: `tests/recurring.test.ts`

**Interfaces:**
- Consumes: `nextOccurrences`, `addDaysUTC` de `@/lib/recurrence`; `prisma` de `@/lib/prisma`; modelo `RecurringRule` (Task 1).
- Produces (Tasks 4, 5, 7 dependen de estas firmas):
  - `HORIZON_DAYS = 90` (const exportada)
  - `materializeRecurringForUser(userId: string, now?: Date): Promise<void>`
  - `confirmTransactionForUser(userId: string, id: string): Promise<{ ok: boolean }>`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/recurring.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addDaysUTC } from '@/lib/recurrence'
import { materializeRecurringForUser, confirmTransactionForUser } from '@/lib/recurring'

const email = `rec_${Date.now()}@growly.app`
const now = new Date()
let userId = ''
let accountId = ''

describe.skipIf(!process.env.DATABASE_URL)('materializeRecurringForUser', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Rec Test', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    accountId = a.id
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.recurringRule.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('genera PENDING hasta 90 días y avanza materializedThrough', async () => {
    const rule = await prisma.recurringRule.create({
      data: {
        userId, accountId, type: 'EXPENSE', amount: 1600, description: 'Netflix',
        frequency: 'MONTHLY', startDate: addDaysUTC(now, 2),
      },
    })
    await materializeRecurringForUser(userId, now)
    const txns = await prisma.transaction.findMany({ where: { recurringRuleId: rule.id } })
    // mensual desde now+2d dentro de (now, now+90d]: exactamente 3 ocurrencias
    expect(txns.length).toBe(3)
    expect(txns.every((t) => t.status === 'PENDING')).toBe(true)
    expect(txns.every((t) => t.amount === 1600 && t.type === 'EXPENSE')).toBe(true)
    const updated = await prisma.recurringRule.findUnique({ where: { id: rule.id } })
    expect(updated!.materializedThrough!.getTime()).toBe(addDaysUTC(now, 90).getTime())
  })

  it('es idempotente: segunda llamada no crea nada', async () => {
    await materializeRecurringForUser(userId, now)
    const count = await prisma.transaction.count({ where: { userId, description: 'Netflix' } })
    expect(count).toBe(3)
  })

  it('una PENDING borrada NO se regenera (saltar una vez)', async () => {
    const one = await prisma.transaction.findFirst({ where: { userId, description: 'Netflix' } })
    await prisma.transaction.delete({ where: { id: one!.id } })
    await materializeRecurringForUser(userId, now)
    expect(await prisma.transaction.count({ where: { userId, description: 'Netflix' } })).toBe(2)
  })

  it('una regla pausada no genera', async () => {
    await prisma.recurringRule.create({
      data: {
        userId, accountId, type: 'EXPENSE', amount: 999, description: 'Pausada',
        frequency: 'MONTHLY', startDate: addDaysUTC(now, 1), active: false,
      },
    })
    await materializeRecurringForUser(userId, now)
    expect(await prisma.transaction.count({ where: { userId, description: 'Pausada' } })).toBe(0)
  })

  it('respeta endDate', async () => {
    await prisma.recurringRule.create({
      data: {
        userId, accountId, type: 'INCOME', amount: 5000, description: 'Corta',
        frequency: 'WEEKLY', startDate: addDaysUTC(now, 1), endDate: addDaysUTC(now, 20),
      },
    })
    await materializeRecurringForUser(userId, now)
    // semanal desde now+1d hasta now+20d: días +1, +8, +15 → 3
    expect(await prisma.transaction.count({ where: { userId, description: 'Corta' } })).toBe(3)
  })
})

describe.skipIf(!process.env.DATABASE_URL)('confirmTransactionForUser', () => {
  it('PENDING → CLEARED; segunda vez ok:false; ajena ok:false', async () => {
    const t = await prisma.transaction.create({
      data: {
        userId, accountId, type: 'EXPENSE', amount: 1000, description: 'Confirmable',
        date: addDaysUTC(now, -1), status: 'PENDING',
      },
    })
    expect(await confirmTransactionForUser(userId, t.id)).toEqual({ ok: true })
    const after = await prisma.transaction.findUnique({ where: { id: t.id } })
    expect(after!.status).toBe('CLEARED')
    expect(after!.date.getTime()).toBe(addDaysUTC(now, -1).getTime()) // la fecha no cambia
    expect(await confirmTransactionForUser(userId, t.id)).toEqual({ ok: false })
    expect(await confirmTransactionForUser('otro-user', t.id)).toEqual({ ok: false })
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/recurring.test.ts`
Expected: FAIL, `Cannot find module '@/lib/recurring'`

- [ ] **Step 3: Implementar `lib/recurring.ts`**

```ts
import { prisma } from '@/lib/prisma'
import { nextOccurrences, addDaysUTC } from '@/lib/recurrence'

export const HORIZON_DAYS = 90

// Materialización perezosa e idempotente: crea los PENDING que falten hasta
// `now + HORIZON_DAYS` y avanza materializedThrough — ambos en la misma transacción.
// Nunca genera detrás de materializedThrough: borrar una ocurrencia = saltarla.
export async function materializeRecurringForUser(userId: string, now: Date = new Date()) {
  const horizon = addDaysUTC(now, HORIZON_DAYS)
  const rules = await prisma.recurringRule.findMany({
    where: {
      userId,
      active: true,
      OR: [{ materializedThrough: null }, { materializedThrough: { lt: horizon } }],
    },
  })
  for (const rule of rules) {
    const fromExclusive = rule.materializedThrough ?? new Date(rule.startDate.getTime() - 1)
    const dates = nextOccurrences(rule, fromExclusive, horizon)
    await prisma.$transaction([
      ...(dates.length
        ? [prisma.transaction.createMany({
            data: dates.map((date) => ({
              userId,
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              type: rule.type,
              amount: rule.amount,
              description: rule.description,
              date,
              status: 'PENDING' as const,
              recurringRuleId: rule.id,
            })),
            skipDuplicates: true,
          })]
        : []),
      prisma.recurringRule.update({ where: { id: rule.id }, data: { materializedThrough: horizon } }),
    ])
  }
}

export async function confirmTransactionForUser(userId: string, id: string) {
  const res = await prisma.transaction.updateMany({
    where: { id, userId, status: 'PENDING' },
    data: { status: 'CLEARED' },
  })
  return { ok: res.count > 0 }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/recurring.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/recurring.ts tests/recurring.test.ts
git commit -m "feat: materialización perezosa de recurrencias + confirmar PENDING"
```

---

### Task 4: `lib/recurring.ts`, CRUD de reglas con semántica de edición

**Files:**
- Modify: `lib/recurring.ts`
- Test: `tests/recurring-crud.test.ts`

**Interfaces:**
- Consumes: Task 3 (`materializeRecurringForUser`), `RecurringRuleFormValues`, se define en Task 5 pero para no bloquear, este task define el tipo localmente idéntico (ver Step 3; Task 5 lo sustituye por el import de validators).
- Produces (Tasks 5 y 7 dependen de estas firmas):
  - `getRecurringRulesForUser(userId)` → reglas con `include: { account: { select: { name } }, category: { select: { name, icon } } }`, orden `createdAt asc`
  - `createRecurringRuleForUser(userId, data: RecurringRuleData)`
  - `updateRecurringRuleForUser(userId, id, data: RecurringRuleData, now?): Promise<{ ok: boolean }>`
  - `setRecurringRuleActiveForUser(userId, id, active: boolean, now?): Promise<{ ok: boolean }>`
  - `deleteRecurringRuleForUser(userId, id, now?): Promise<{ ok: boolean }>`
  - `type RecurringRuleData = { type: 'INCOME' | 'EXPENSE'; amount: number; accountId: string; categoryId?: string | null; description: string; frequency: RecurrenceFrequency; startDate: Date; endDate?: Date | null }`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/recurring-crud.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addDaysUTC } from '@/lib/recurrence'
import {
  materializeRecurringForUser,
  createRecurringRuleForUser, getRecurringRulesForUser,
  updateRecurringRuleForUser, setRecurringRuleActiveForUser, deleteRecurringRuleForUser,
} from '@/lib/recurring'

const email = `reccrud_${Date.now()}@growly.app`
const now = new Date()
let userId = ''
let accountId = ''

const baseRule = () => ({
  type: 'EXPENSE' as const, amount: 1600, accountId, categoryId: null,
  description: 'Gym', frequency: 'MONTHLY' as const,
  startDate: addDaysUTC(now, -40), endDate: null,
})

describe.skipIf(!process.env.DATABASE_URL)('CRUD de reglas recurrentes', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'RecCrud', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    accountId = a.id
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.recurringRule.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('create + get devuelven la regla con account/category', async () => {
    const rule = await createRecurringRuleForUser(userId, baseRule())
    expect(rule.userId).toBe(userId)
    const list = await getRecurringRulesForUser(userId)
    expect(list.length).toBe(1)
    expect(list[0].account.name).toBe('C')
  })

  it('editar la regla borra las PENDING futuras y regenera con los nuevos valores', async () => {
    // startDate hace 40 días → materializa 2 vencidas (−40, ~−10) y 3 futuras (~+20, ~+50, ~+80)
    await materializeRecurringForUser(userId, now)
    const rule = (await getRecurringRulesForUser(userId))[0]
    const before = await prisma.transaction.findMany({ where: { recurringRuleId: rule.id } })
    const overdueBefore = before.filter((t) => t.date.getTime() <= now.getTime())
    const futureBefore = before.filter((t) => t.date.getTime() > now.getTime())
    expect(overdueBefore.length).toBe(2)
    expect(futureBefore.length).toBe(3)

    const res = await updateRecurringRuleForUser(userId, rule.id, { ...baseRule(), amount: 2000 }, now)
    expect(res.ok).toBe(true)
    // futuras borradas, vencidas intactas, marcador reseteado
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id, date: { gt: now } } })).toBe(0)
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id } })).toBe(2)

    await materializeRecurringForUser(userId, now)
    const regen = await prisma.transaction.findMany({ where: { recurringRuleId: rule.id, date: { gt: now } } })
    expect(regen.length).toBe(3)
    expect(regen.every((t) => t.amount === 2000)).toBe(true)
    expect(regen.every((t) => t.status === 'PENDING')).toBe(true)
  })

  it('pausar borra futuras y no regenera; reanudar regenera', async () => {
    const rule = (await getRecurringRulesForUser(userId))[0]
    expect((await setRecurringRuleActiveForUser(userId, rule.id, false, now)).ok).toBe(true)
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id, date: { gt: now } } })).toBe(0)
    await materializeRecurringForUser(userId, now)
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id, date: { gt: now } } })).toBe(0)
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id } })).toBe(2) // vencidas intactas

    expect((await setRecurringRuleActiveForUser(userId, rule.id, true, now)).ok).toBe(true)
    await materializeRecurringForUser(userId, now)
    expect(await prisma.transaction.count({ where: { recurringRuleId: rule.id, date: { gt: now } } })).toBe(3)
  })

  it('borrar la regla elimina futuras PENDING y conserva el histórico con recurringRuleId null', async () => {
    const rule = (await getRecurringRulesForUser(userId))[0]
    // confirmamos una futura para simular histórico CLEARED
    const fut = await prisma.transaction.findFirst({ where: { recurringRuleId: rule.id, date: { gt: now } } })
    await prisma.transaction.update({ where: { id: fut!.id }, data: { status: 'CLEARED' } })

    expect((await deleteRecurringRuleForUser(userId, rule.id, now)).ok).toBe(true)
    expect(await prisma.recurringRule.count({ where: { userId } })).toBe(0)
    // la CLEARED futura sobrevive con la referencia a null; las PENDING futuras no
    const survivors = await prisma.transaction.findMany({ where: { userId, date: { gt: now } } })
    expect(survivors.length).toBe(1)
    expect(survivors[0].status).toBe('CLEARED')
    expect(survivors[0].recurringRuleId).toBeNull()
    // vencidas PENDING también sobreviven (para confirmarlas o borrarlas)
    expect(await prisma.transaction.count({ where: { userId, date: { lte: now }, status: 'PENDING' } })).toBe(2)
  })

  it('ownership: id ajeno → ok:false y no toca nada', async () => {
    expect((await updateRecurringRuleForUser('nadie', 'no-existe', baseRule())).ok).toBe(false)
    expect((await setRecurringRuleActiveForUser('nadie', 'no-existe', false)).ok).toBe(false)
    expect((await deleteRecurringRuleForUser('nadie', 'no-existe')).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/recurring-crud.test.ts`
Expected: FAIL, `createRecurringRuleForUser` no exportada.

- [ ] **Step 3: Añadir el CRUD a `lib/recurring.ts`**

Añadir al final del archivo:

```ts
import type { RecurrenceFrequency } from '@/lib/recurrence'

export type RecurringRuleData = {
  type: 'INCOME' | 'EXPENSE'
  amount: number
  accountId: string
  categoryId?: string | null
  description: string
  frequency: RecurrenceFrequency
  startDate: Date
  endDate?: Date | null
}

export function getRecurringRulesForUser(userId: string) {
  return prisma.recurringRule.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: {
      account: { select: { name: true } },
      category: { select: { name: true, icon: true } },
    },
  })
}

export function createRecurringRuleForUser(userId: string, data: RecurringRuleData) {
  return prisma.recurringRule.create({ data: { ...data, userId } })
}

// Editar una regla: sus PENDING futuras se borran y el marcador vuelve a `now`,
// de modo que la próxima materialización regenera la serie con los valores nuevos.
// Lo pasado y lo CLEARED no se toca.
export function updateRecurringRuleForUser(
  userId: string, id: string, data: RecurringRuleData, now: Date = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.recurringRule.updateMany({
      where: { id, userId },
      data: { ...data, materializedThrough: now },
    })
    if (updated.count === 0) return { ok: false }
    await tx.transaction.deleteMany({
      where: { recurringRuleId: id, userId, status: 'PENDING', date: { gt: now } },
    })
    return { ok: true }
  })
}

export function setRecurringRuleActiveForUser(
  userId: string, id: string, active: boolean, now: Date = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.recurringRule.updateMany({
      where: { id, userId },
      data: active ? { active: true, materializedThrough: now } : { active: false },
    })
    if (updated.count === 0) return { ok: false }
    if (!active) {
      await tx.transaction.deleteMany({
        where: { recurringRuleId: id, userId, status: 'PENDING', date: { gt: now } },
      })
    }
    return { ok: true }
  })
}

export function deleteRecurringRuleForUser(userId: string, id: string, now: Date = new Date()) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.recurringRule.findFirst({ where: { id, userId }, select: { id: true } })
    if (!owned) return { ok: false }
    await tx.transaction.deleteMany({
      where: { recurringRuleId: id, userId, status: 'PENDING', date: { gt: now } },
    })
    await tx.recurringRule.delete({ where: { id } }) // histórico queda con SetNull
    return { ok: true }
  })
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/recurring-crud.test.ts tests/recurring.test.ts`
Expected: PASS (los dos archivos)

- [ ] **Step 5: Commit**

```bash
git add lib/recurring.ts tests/recurring-crud.test.ts
git commit -m "feat: CRUD de reglas recurrentes con semántica de edición predecible"
```

---

### Task 5: Validators + server actions (`lib/recurring-actions.ts`)

**Files:**
- Modify: `lib/validators.ts`
- Create: `lib/recurring-actions.ts`
- Test: `tests/recurring-actions.test.ts`

**Interfaces:**
- Consumes: Task 4 (CRUD lib), patrón de `lib/transaction-actions.ts` (auth + zod + ownership + revalidate).
- Produces (Task 6/7 dependen de estos nombres):
  - `recurringRuleBaseSchema`, `createRecurringRuleSchema`, `type RecurringRuleFormValues` en `lib/validators.ts`
  - Actions: `createRecurringRule(values: unknown)`, `updateRecurringRule(id: string, values: unknown)`, `setRecurringRuleActive(id: string, active: boolean)`, `deleteRecurringRule(id: string)`, `confirmTransaction(id: string)`, todas devuelven `{ ok: true } | { ok: false, error: string }`.

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/recurring-actions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { addDaysUTC } from '@/lib/recurrence'

const email = `recact_${Date.now()}@growly.app`
let userId = ''
let accountId = ''

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  createRecurringRule, updateRecurringRule, setRecurringRuleActive,
  deleteRecurringRule, confirmTransaction,
} from '@/lib/recurring-actions'

const now = new Date()
const iso = (d: Date) => d.toISOString().slice(0, 10)

describe.skipIf(!process.env.DATABASE_URL)('recurring actions', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'RecAct', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    accountId = a.id
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.recurringRule.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('createRecurringRule crea la regla', async () => {
    const res = await createRecurringRule({
      type: 'EXPENSE', amount: 1600, accountId, categoryId: null, description: 'Netflix',
      frequency: 'MONTHLY', startDate: iso(addDaysUTC(now, 2)), endDate: null,
    })
    expect(res.ok).toBe(true)
    expect(await prisma.recurringRule.count({ where: { userId } })).toBe(1)
  })

  it('rechaza startDate en el pasado (al crear)', async () => {
    const res = await createRecurringRule({
      type: 'EXPENSE', amount: 1600, accountId, description: 'Vieja',
      frequency: 'MONTHLY', startDate: iso(addDaysUTC(now, -30)),
    })
    expect(res.ok).toBe(false)
  })

  it('rechaza cuenta ajena', async () => {
    const res = await createRecurringRule({
      type: 'EXPENSE', amount: 1600, accountId: 'cuenta-ajena-000', description: 'x',
      frequency: 'MONTHLY', startDate: iso(addDaysUTC(now, 2)),
    })
    expect(res.ok).toBe(false)
  })

  it('rechaza endDate anterior a startDate', async () => {
    const res = await createRecurringRule({
      type: 'EXPENSE', amount: 1600, accountId, description: 'x',
      frequency: 'MONTHLY', startDate: iso(addDaysUTC(now, 10)), endDate: iso(addDaysUTC(now, 5)),
    })
    expect(res.ok).toBe(false)
  })

  it('updateRecurringRule acepta startDate pasada (regla existente)', async () => {
    const rule = await prisma.recurringRule.findFirst({ where: { userId } })
    const res = await updateRecurringRule(rule!.id, {
      type: 'EXPENSE', amount: 2000, accountId, categoryId: null, description: 'Netflix 4K',
      frequency: 'MONTHLY', startDate: iso(addDaysUTC(now, -60)), endDate: null,
    })
    expect(res.ok).toBe(true)
    const updated = await prisma.recurringRule.findUnique({ where: { id: rule!.id } })
    expect(updated!.amount).toBe(2000)
  })

  it('setRecurringRuleActive pausa y reanuda', async () => {
    const rule = await prisma.recurringRule.findFirst({ where: { userId } })
    expect((await setRecurringRuleActive(rule!.id, false)).ok).toBe(true)
    expect((await prisma.recurringRule.findUnique({ where: { id: rule!.id } }))!.active).toBe(false)
    expect((await setRecurringRuleActive(rule!.id, true)).ok).toBe(true)
  })

  it('confirmTransaction confirma una PENDING propia', async () => {
    const t = await prisma.transaction.create({
      data: {
        userId, accountId, type: 'EXPENSE', amount: 500, description: 'Pendiente',
        date: addDaysUTC(now, -1), status: 'PENDING',
      },
    })
    expect((await confirmTransaction(t.id)).ok).toBe(true)
    expect((await prisma.transaction.findUnique({ where: { id: t.id } }))!.status).toBe('CLEARED')
  })

  it('deleteRecurringRule borra la regla', async () => {
    const rule = await prisma.recurringRule.findFirst({ where: { userId } })
    expect((await deleteRecurringRule(rule!.id)).ok).toBe(true)
    expect(await prisma.recurringRule.count({ where: { userId } })).toBe(0)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/recurring-actions.test.ts`
Expected: FAIL, `Cannot find module '@/lib/recurring-actions'`

- [ ] **Step 3: Añadir schemas a `lib/validators.ts`**

Añadir al final del archivo:

```ts
export const recurringRuleBaseSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE']),
    amount: z.number().int().positive(),
    accountId: z.string().min(1, 'Cuenta requerida'),
    categoryId: z.string().nullable().optional(),
    description: z.string().min(1, 'Descripción requerida'),
    frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY']),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
  })
  .refine((d) => !d.endDate || d.endDate.getTime() > d.startDate.getTime(), {
    message: 'La fecha fin debe ser posterior al inicio',
    path: ['endDate'],
  })

// Al crear, la primera fecha debe ser reciente/futura (margen de 24h por zonas horarias):
// evita que una regla "desde enero" inunde la app de PENDING vencidos.
export const createRecurringRuleSchema = recurringRuleBaseSchema.refine(
  (d) => d.startDate.getTime() >= Date.now() - 86_400_000,
  { message: 'La primera fecha debe ser hoy o futura', path: ['startDate'] },
)

export type RecurringRuleFormValues = z.infer<typeof recurringRuleBaseSchema>
```

- [ ] **Step 4: Implementar `lib/recurring-actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recurringRuleBaseSchema, createRecurringRuleSchema } from '@/lib/validators'
import {
  createRecurringRuleForUser, updateRecurringRuleForUser,
  setRecurringRuleActiveForUser, deleteRecurringRuleForUser,
  confirmTransactionForUser,
} from '@/lib/recurring'

function revalidate() {
  revalidatePath('/movimientos')
  revalidatePath('/cuentas')
  revalidatePath('/')
}

async function checkOwnership(uid: string, data: { accountId: string; categoryId?: string | null }) {
  const ownsAccount = await prisma.account.findFirst({
    where: { id: data.accountId, userId: uid }, select: { id: true },
  })
  if (!ownsAccount) return 'Cuenta no válida'
  if (data.categoryId) {
    const okCat = await prisma.category.findFirst({
      where: { id: data.categoryId, OR: [{ userId: null }, { userId: uid }] }, select: { id: true },
    })
    if (!okCat) return 'Categoría no válida'
  }
  return null
}

export async function createRecurringRule(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsed = createRecurringRuleSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const err = await checkOwnership(session.user.id, parsed.data)
  if (err) return { ok: false as const, error: err }

  try {
    await createRecurringRuleForUser(session.user.id, parsed.data)
  } catch {
    return { ok: false as const, error: 'No se pudo guardar la recurrencia' }
  }
  revalidate()
  return { ok: true as const }
}

export async function updateRecurringRule(id: string, values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsed = recurringRuleBaseSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const err = await checkOwnership(session.user.id, parsed.data)
  if (err) return { ok: false as const, error: err }

  try {
    const res = await updateRecurringRuleForUser(session.user.id, id, parsed.data)
    if (!res.ok) return { ok: false as const, error: 'Recurrencia no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo actualizar la recurrencia' }
  }
  revalidate()
  return { ok: true as const }
}

export async function setRecurringRuleActive(id: string, active: boolean) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  try {
    const res = await setRecurringRuleActiveForUser(session.user.id, id, active)
    if (!res.ok) return { ok: false as const, error: 'Recurrencia no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo cambiar la recurrencia' }
  }
  revalidate()
  return { ok: true as const }
}

export async function deleteRecurringRule(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  try {
    const res = await deleteRecurringRuleForUser(session.user.id, id)
    if (!res.ok) return { ok: false as const, error: 'Recurrencia no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo borrar la recurrencia' }
  }
  revalidate()
  return { ok: true as const }
}

export async function confirmTransaction(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  try {
    const res = await confirmTransactionForUser(session.user.id, id)
    if (!res.ok) return { ok: false as const, error: 'Movimiento no encontrado' }
  } catch {
    return { ok: false as const, error: 'No se pudo confirmar el movimiento' }
  }
  revalidate()
  return { ok: true as const }
}
```

Nota: `RecurringRuleData` (Task 4) y `RecurringRuleFormValues` (validators) son estructuralmente
idénticos a propósito: `parsed.data` se pasa directo al CRUD sin conversión. No unificarlos con
imports cruzados; mantener el tipo local en `lib/recurring.ts`.

- [ ] **Step 5: Verificar que pasan**

Run: `npx vitest run tests/recurring-actions.test.ts`
Expected: PASS (8 tests)

Run: `npx vitest run`
Expected: suite completa verde.

- [ ] **Step 6: Commit**

```bash
git add lib/validators.ts lib/recurring-actions.ts lib/recurring.ts tests/recurring-actions.test.ts
git commit -m "feat: schemas y server actions de recurrencias (auth + zod + ownership)"
```

---

### Task 6: Componentes, badge/acción en TransactionRow, ConfirmTransactionButton, RecurringRow, RecurringDialog

**Files:**
- Modify: `components/growly/transaction-row.tsx`
- Create: `components/growly/confirm-transaction-button.tsx`
- Create: `components/growly/recurring-dialog.tsx`
- Create: `components/growly/recurring-row.tsx`
- Test: `tests/recurring-components.test.tsx`

**Interfaces:**
- Consumes: actions de Task 5; `CategoryIcon` (prop `name`), `SignedAmount` (prop `cents`), `Dialog/DialogTrigger(render)/DialogContent/DialogTitle`, `Button`, `Input`, `Label`, `parseAmountToCents`, todos existentes.
- Produces (Task 7 depende de estas props):
  - `TransactionRow` gana props opcionales `badge?: { label: string; tone: 'danger' | 'muted' }` y `action?: React.ReactNode` (retro-compatible).
  - `ConfirmTransactionButton({ id: string })`
  - `type RecurringFormInitial = { type: 'INCOME' | 'EXPENSE'; amountStr: string; description: string; accountId: string; categoryId: string; frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY'; startDate: string; endDate: string }` (exportado desde `recurring-dialog.tsx`)
  - `RecurringDialog({ accounts, categories, ruleId?, initial?, trigger? })`
  - `RecurringRow({ rule, accounts, categories })` con `rule: { id, description, type, amount, active, freqLabel, nextLabel, accountName, icon, initial: RecurringFormInitial }`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/recurring-components.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/recurring-actions', () => ({
  createRecurringRule: vi.fn(async () => ({ ok: true })),
  updateRecurringRule: vi.fn(async () => ({ ok: true })),
  setRecurringRuleActive: vi.fn(async () => ({ ok: true })),
  deleteRecurringRule: vi.fn(async () => ({ ok: true })),
  confirmTransaction: vi.fn(async () => ({ ok: true })),
}))

import { TransactionRow } from '@/components/growly/transaction-row'
import { ConfirmTransactionButton } from '@/components/growly/confirm-transaction-button'
import { RecurringRow } from '@/components/growly/recurring-row'
import { RecurringDialog, type RecurringFormInitial } from '@/components/growly/recurring-dialog'
import { confirmTransaction, setRecurringRuleActive } from '@/lib/recurring-actions'

const accounts = [{ id: 'a1', name: 'Corriente' }]
const categories = [{ id: 'c1', name: 'Ocio', kind: 'EXPENSE' as const }]

describe('<TransactionRow> con badge y acción', () => {
  it('muestra el badge y renderiza la acción', () => {
    render(
      <TransactionRow description="Netflix" meta="Ocio" signedCents={-1600}
        badge={{ label: 'Vencido', tone: 'danger' }} action={<button>Confirmar</button>} />,
    )
    expect(screen.getByText('Vencido')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
  })
  it('sin badge ni acción funciona como antes', () => {
    render(<TransactionRow description="Café" meta="Comida" signedCents={-500} />)
    expect(screen.getByText('Café')).toBeInTheDocument()
  })
})

describe('<ConfirmTransactionButton>', () => {
  it('llama a confirmTransaction con el id', async () => {
    render(<ConfirmTransactionButton id="tx9" />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(confirmTransaction).toHaveBeenCalledWith('tx9'))
  })
})

const initial: RecurringFormInitial = {
  type: 'EXPENSE', amountStr: '16.00', description: 'Netflix', accountId: 'a1',
  categoryId: 'c1', frequency: 'MONTHLY', startDate: '2026-07-12', endDate: '',
}

describe('<RecurringRow>', () => {
  const rule = {
    id: 'r1', description: 'Netflix', type: 'EXPENSE' as const, amount: 1600, active: true,
    freqLabel: 'Cada mes · día 12', nextLabel: 'próxima: 12 ago', accountName: 'Corriente',
    icon: 'film', initial,
  }
  it('muestra descripción, frecuencia, próxima y monto', () => {
    render(<RecurringRow rule={rule} accounts={accounts} categories={categories} />)
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText(/Cada mes · día 12/)).toBeInTheDocument()
    expect(screen.getByText(/próxima: 12 ago/)).toBeInTheDocument()
    expect(screen.getByText('−$16.00')).toBeInTheDocument()
  })
  it('pausar llama a setRecurringRuleActive(id, false)', async () => {
    render(<RecurringRow rule={rule} accounts={accounts} categories={categories} />)
    fireEvent.click(screen.getByTitle('Pausar'))
    await waitFor(() => expect(setRecurringRuleActive).toHaveBeenCalledWith('r1', false))
  })
  it('pausada muestra badge y botón Reanudar', () => {
    render(<RecurringRow rule={{ ...rule, active: false }} accounts={accounts} categories={categories} />)
    expect(screen.getByText('Pausada')).toBeInTheDocument()
    expect(screen.getByTitle('Reanudar')).toBeInTheDocument()
  })
})

describe('<RecurringDialog>', () => {
  it('abre y muestra los campos', () => {
    render(<RecurringDialog accounts={accounts} categories={categories} />)
    fireEvent.click(screen.getByRole('button', { name: /Nueva recurrencia/i }))
    expect(screen.getByLabelText('Importe')).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument()
    expect(screen.getByLabelText('Frecuencia')).toBeInTheDocument()
    expect(screen.getByLabelText('Primera fecha')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha fin (opcional)')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/recurring-components.test.tsx`
Expected: FAIL, módulos `confirm-transaction-button`/`recurring-row`/`recurring-dialog` no existen.

- [ ] **Step 3: Extender `components/growly/transaction-row.tsx`**

Sustituir el archivo por:

```tsx
import type * as React from 'react'
import { CategoryIcon } from '@/components/growly/category-icon'
import { SignedAmount } from '@/components/growly/money'

export function TransactionRow({
  description, meta, signedCents, iconName = 'ellipsis', badge, action,
}: {
  description: string
  meta: string
  signedCents: number
  iconName?: string
  badge?: { label: string; tone: 'danger' | 'muted' }
  action?: React.ReactNode
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
      {badge && (
        <span
          className={
            badge.tone === 'danger'
              ? 'rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-bold text-destructive'
              : 'rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground'
          }
        >
          {badge.label}
        </span>
      )}
      <SignedAmount cents={signedCents} className="text-[15px] font-extrabold" />
      {action}
    </div>
  )
}
```

- [ ] **Step 4: Crear `components/growly/confirm-transaction-button.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { confirmTransaction } from '@/lib/recurring-actions'

export function ConfirmTransactionButton({ id }: { id: string }) {
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await confirmTransaction(id) })}
      className="rounded-[9px] border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
    >
      {pending ? '…' : 'Confirmar'}
    </button>
  )
}
```

- [ ] **Step 5: Crear `components/growly/recurring-dialog.tsx`**

```tsx
'use client'

import * as React from 'react'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createRecurringRule, updateRecurringRule } from '@/lib/recurring-actions'
import { parseAmountToCents } from '@/lib/money'

type AccountOpt = { id: string; name: string }
type CategoryOpt = { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }
type RuleType = 'EXPENSE' | 'INCOME'

export type RecurringFormInitial = {
  type: RuleType
  amountStr: string
  description: string
  accountId: string
  categoryId: string
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY'
  startDate: string // YYYY-MM-DD
  endDate: string // '' si no hay
}

const SEG: { value: RuleType; label: string }[] = [
  { value: 'EXPENSE', label: 'Gasto' },
  { value: 'INCOME', label: 'Ingreso' },
]

const FRECUENCIAS = [
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'BIWEEKLY', label: 'Quincenal' },
  { value: 'MONTHLY', label: 'Mensual' },
  { value: 'YEARLY', label: 'Anual' },
]

const selectCls = 'h-11 w-full rounded-md border border-input bg-field px-3 text-sm'

export function RecurringDialog({
  accounts, categories, ruleId, initial, trigger,
}: {
  accounts: AccountOpt[]
  categories: CategoryOpt[]
  ruleId?: string
  initial?: RecurringFormInitial
  trigger?: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<RuleType>(initial?.type ?? 'EXPENSE')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset() {
    setType(initial?.type ?? 'EXPENSE')
    setError(null)
  }

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

    const payload = {
      type,
      amount,
      description: String(fd.get('description') ?? ''),
      accountId: String(fd.get('accountId') ?? ''),
      categoryId: String(fd.get('categoryId') ?? '') || null,
      frequency: String(fd.get('frequency') ?? 'MONTHLY'),
      startDate: String(fd.get('startDate') ?? ''),
      endDate: String(fd.get('endDate') ?? '') || null,
    }

    const res = ruleId
      ? await updateRecurringRule(ruleId, payload)
      : await createRecurringRule(payload)
    setLoading(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setOpen(false)
    reset()
  }

  const cats = categories.filter((c) => c.kind === type)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button className="h-11 font-extrabold">
              <Plus size={18} /> Nueva recurrencia
            </Button>
          )
        }
      />
      <DialogContent className="w-full max-w-[440px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">
          {ruleId ? 'Editar recurrencia' : 'Nueva recurrencia'}
        </DialogTitle>

        <div className="mb-4 flex gap-1 rounded-xl bg-muted p-1">
          {SEG.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setType(s.value)}
              className={`flex-1 rounded-lg py-2 text-sm font-bold ${
                type === s.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="rec-amount">Importe</Label>
            <Input id="rec-amount" name="amount" inputMode="decimal" placeholder="0.00"
              defaultValue={initial?.amountStr} required />
          </div>
          <div>
            <Label htmlFor="rec-description">Descripción</Label>
            <Input id="rec-description" name="description" defaultValue={initial?.description} required />
          </div>
          <div>
            <Label htmlFor="rec-categoryId">Categoría</Label>
            <select id="rec-categoryId" name="categoryId" className={selectCls}
              defaultValue={initial?.categoryId}>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="rec-accountId">Cuenta</Label>
            <select id="rec-accountId" name="accountId" className={selectCls}
              defaultValue={initial?.accountId}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="rec-frequency">Frecuencia</Label>
            <select id="rec-frequency" name="frequency" className={selectCls}
              defaultValue={initial?.frequency ?? 'MONTHLY'}>
              {FRECUENCIAS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="rec-startDate">Primera fecha</Label>
            <Input id="rec-startDate" name="startDate" type="date"
              defaultValue={initial?.startDate ?? today} required />
          </div>
          <div>
            <Label htmlFor="rec-endDate">Fecha fin (opcional)</Label>
            <Input id="rec-endDate" name="endDate" type="date" defaultValue={initial?.endDate} />
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

- [ ] **Step 6: Crear `components/growly/recurring-row.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { Pause, Play, Pencil, Trash2 } from 'lucide-react'
import { CategoryIcon } from '@/components/growly/category-icon'
import { SignedAmount } from '@/components/growly/money'
import { RecurringDialog, type RecurringFormInitial } from '@/components/growly/recurring-dialog'
import { setRecurringRuleActive, deleteRecurringRule } from '@/lib/recurring-actions'

type AccountOpt = { id: string; name: string }
type CategoryOpt = { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }

export type RecurringRuleView = {
  id: string
  description: string
  type: 'INCOME' | 'EXPENSE'
  amount: number
  active: boolean
  freqLabel: string
  nextLabel: string
  accountName: string
  icon: string
  initial: RecurringFormInitial
}

const iconBtnCls =
  'flex h-8 w-8 items-center justify-center rounded-[9px] border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50'

export function RecurringRow({
  rule, accounts, categories,
}: {
  rule: RecurringRuleView
  accounts: AccountOpt[]
  categories: CategoryOpt[]
}) {
  const [pending, start] = useTransition()
  const signed = rule.type === 'INCOME' ? rule.amount : -rule.amount

  return (
    <div className="flex items-center gap-3 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <CategoryIcon name={rule.icon} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">{rule.description}</span>
          {!rule.active && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
              Pausada
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {rule.freqLabel} · {rule.nextLabel} · {rule.accountName}
        </div>
      </div>
      <SignedAmount cents={signed} className="text-[15px] font-extrabold" />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          title={rule.active ? 'Pausar' : 'Reanudar'}
          disabled={pending}
          onClick={() => start(async () => { await setRecurringRuleActive(rule.id, !rule.active) })}
          className={iconBtnCls}
        >
          {rule.active ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <RecurringDialog
          accounts={accounts}
          categories={categories}
          ruleId={rule.id}
          initial={rule.initial}
          trigger={
            <button type="button" title="Editar" className={iconBtnCls}>
              <Pencil size={15} />
            </button>
          }
        />
        <button
          type="button"
          title="Borrar"
          disabled={pending}
          onClick={() => start(async () => { await deleteRecurringRule(rule.id) })}
          className={iconBtnCls}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verificar que pasan**

Run: `npx vitest run tests/recurring-components.test.tsx tests/transaction-components.test.tsx`
Expected: PASS (los nuevos y los existentes de TransactionRow siguen verdes).

- [ ] **Step 8: Commit**

```bash
git add components/growly/transaction-row.tsx components/growly/confirm-transaction-button.tsx components/growly/recurring-dialog.tsx components/growly/recurring-row.tsx tests/recurring-components.test.tsx
git commit -m "feat: componentes de recurrencias (fila, diálogo, confirmar) + badge en TransactionRow"
```

---

### Task 7: Página `/movimientos` con pestañas + materialización en página y dashboard

**Files:**
- Modify: `app/(app)/movimientos/page.tsx`
- Modify: `lib/dashboard.ts`
- Test: `tests/dashboard.test.ts` (añadir describe al final)

**Interfaces:**
- Consumes: todo lo anterior, `materializeRecurringForUser`, `getRecurringRulesForUser` (Task 3/4), `describeFrequency`, `nextDateForRule`, `formatShortDateUTC` (Task 2), componentes (Task 6).
- Produces: página con `searchParams: Promise<{ tipo?: string; vista?: string }>`; `getDashboardData` materializa antes de leer.

- [ ] **Step 1: Escribir el test de integración del dashboard (falla)**

Añadir al FINAL de `tests/dashboard.test.ts`:

```ts
import { addDaysUTC } from '@/lib/recurrence'

describe.skipIf(!process.env.DATABASE_URL)('getDashboardData materializa recurrencias', () => {
  const email = `dashrec_${Date.now()}@growly.app`
  const now2 = new Date()
  let uid = ''
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'DashRec', email } })
    uid = u.id
    const a = await prisma.account.create({ data: { userId: uid, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    await prisma.recurringRule.create({
      data: {
        userId: uid, accountId: a.id, type: 'EXPENSE', amount: 3000, description: 'Gimnasio',
        frequency: 'MONTHLY', startDate: addDaysUTC(now2, 5),
      },
    })
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId: uid } })
    await prisma.recurringRule.deleteMany({ where: { userId: uid } })
    await prisma.account.deleteMany({ where: { userId: uid } })
    await prisma.user.delete({ where: { id: uid } })
  })

  it('las ocurrencias generadas alimentan comprometido y próximos pagos', async () => {
    const d = await getDashboardData(uid, now2)
    // mensual desde now+5d dentro de 90 días → 3 ocurrencias de $30.00
    expect(d.comprometido).toBe(9000)
    expect(d.upcoming[0].description).toBe('Gimnasio')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run tests/dashboard.test.ts`
Expected: FAIL, el nuevo describe: `comprometido` es 0 (no se materializó nada).

- [ ] **Step 3: Materializar en `lib/dashboard.ts`**

En `lib/dashboard.ts`, junto a los imports existentes de `getAccountsWithBalances` etc., añadir:

```ts
import { materializeRecurringForUser } from '@/lib/recurring'
```

y como PRIMERA línea del cuerpo de `getDashboardData`:

```ts
export async function getDashboardData(userId: string, now: Date) {
  await materializeRecurringForUser(userId, now)
  // ... resto igual
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run tests/dashboard.test.ts`
Expected: PASS (incluidos los describes anteriores del archivo).

- [ ] **Step 5: Reescribir `app/(app)/movimientos/page.tsx` con pestañas**

Sustituir el archivo completo por:

```tsx
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getTransactionsForUser, groupTransactionsByDay } from '@/lib/transactions'
import { getAccountsForUser } from '@/lib/accounts'
import { getCategoriesForUser } from '@/lib/categories'
import { getRecurringRulesForUser, materializeRecurringForUser } from '@/lib/recurring'
import { describeFrequency, nextDateForRule, formatShortDateUTC } from '@/lib/recurrence'
import { TransactionRow } from '@/components/growly/transaction-row'
import { TransactionDialog } from '@/components/growly/transaction-dialog'
import { RecurringRow } from '@/components/growly/recurring-row'
import { RecurringDialog } from '@/components/growly/recurring-dialog'
import { ConfirmTransactionButton } from '@/components/growly/confirm-transaction-button'

const FILTERS = [
  { key: undefined, label: 'Todos', href: '/movimientos' },
  { key: 'INCOME' as const, label: 'Ingresos', href: '/movimientos?tipo=ingresos' },
  { key: 'EXPENSE' as const, label: 'Gastos', href: '/movimientos?tipo=gastos' },
]

const tabCls = (active: boolean) =>
  `rounded-[11px] px-4 py-2 text-sm font-bold ${
    active ? 'bg-forest text-white' : 'border border-border bg-card text-muted-foreground'
  }`

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; vista?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { tipo, vista } = await searchParams
  const now = new Date()
  const recurrentes = vista === 'recurrentes'

  await materializeRecurringForUser(userId, now)

  const [accounts, categories] = await Promise.all([
    getAccountsForUser(userId),
    getCategoriesForUser(userId),
  ])
  const accountOpts = accounts.map((a) => ({ id: a.id, name: a.name }))
  const categoryOpts = categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Movimientos</h1>
        {recurrentes ? (
          <RecurringDialog accounts={accountOpts} categories={categoryOpts} />
        ) : (
          <TransactionDialog accounts={accountOpts} categories={categoryOpts} />
        )}
      </div>

      <div className="mb-5 flex gap-2">
        <Link href="/movimientos" className={tabCls(!recurrentes)}>Movimientos</Link>
        <Link href="/movimientos?vista=recurrentes" className={tabCls(recurrentes)}>Recurrentes</Link>
      </div>

      {recurrentes ? (
        <RecurrentesView userId={userId} now={now}
          accountOpts={accountOpts} categoryOpts={categoryOpts} />
      ) : (
        <MovimientosView userId={userId} tipo={tipo} now={now} categories={categories} />
      )}
    </div>
  )
}

async function MovimientosView({
  userId, tipo, now, categories,
}: {
  userId: string
  tipo?: string
  now: Date
  categories: { id: string; name: string; icon: string | null }[]
}) {
  const kind = tipo === 'ingresos' ? 'INCOME' : tipo === 'gastos' ? 'EXPENSE' : undefined
  const txns = await getTransactionsForUser(userId, kind ? { kind } : {})
  const catById = new Map(categories.map((c) => [c.id, c]))
  const groups = groupTransactionsByDay(txns, now)

  return (
    <>
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
          <div key={g.key}>
            <div className="mb-2 px-1 text-xs font-bold tracking-wide text-muted-foreground">{g.label.toUpperCase()}</div>
            <div className="rounded-[22px] border border-border bg-card px-5 shadow-[var(--shadow-card)]">
              {g.items.map((t) => {
                const cat = t.categoryId ? catById.get(t.categoryId) : null
                const time = new Date(t.date).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
                const kindLabel = t.type === 'INCOME' ? 'Ingreso' : t.type === 'TRANSFER' ? 'Transferencia' : (cat?.name ?? 'Gasto')
                const signed = t.type === 'INCOME' ? t.amount : -t.amount
                const isPending = t.status === 'PENDING'
                const overdue = isPending && new Date(t.date).getTime() <= now.getTime()
                return (
                  <TransactionRow
                    key={t.id}
                    description={t.description}
                    meta={`${kindLabel} · ${time}`}
                    signedCents={signed}
                    iconName={cat?.icon ?? 'ellipsis'}
                    badge={isPending
                      ? { label: overdue ? 'Vencido' : 'Programado', tone: overdue ? 'danger' : 'muted' }
                      : undefined}
                    action={overdue ? <ConfirmTransactionButton id={t.id} /> : undefined}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

async function RecurrentesView({
  userId, now, accountOpts, categoryOpts,
}: {
  userId: string
  now: Date
  accountOpts: { id: string; name: string }[]
  categoryOpts: { id: string; name: string; kind: 'INCOME' | 'EXPENSE' }[]
}) {
  const rules = await getRecurringRulesForUser(userId)

  if (rules.length === 0) {
    return (
      <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
        <p className="text-sm text-muted-foreground">
          Sin recurrencias. Crea la primera (Netflix, alquiler, nómina…) y Growly programará los próximos pagos por ti.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[22px] border border-border bg-card px-5 shadow-[var(--shadow-card)]">
      {rules.map((r) => {
        const next = r.active ? nextDateForRule(r, now) : null
        return (
          <RecurringRow
            key={r.id}
            accounts={accountOpts}
            categories={categoryOpts}
            rule={{
              id: r.id,
              description: r.description,
              type: r.type as 'INCOME' | 'EXPENSE',
              amount: r.amount,
              active: r.active,
              freqLabel: describeFrequency(r),
              nextLabel: !r.active ? 'en pausa' : next ? `próxima: ${formatShortDateUTC(next)}` : 'finalizada',
              accountName: r.account.name,
              icon: r.category?.icon ?? 'ellipsis',
              initial: {
                type: r.type as 'INCOME' | 'EXPENSE',
                amountStr: (r.amount / 100).toFixed(2),
                description: r.description,
                accountId: r.accountId,
                categoryId: r.categoryId ?? '',
                frequency: r.frequency,
                startDate: r.startDate.toISOString().slice(0, 10),
                endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : '',
              },
            }}
          />
        )
      })}
    </div>
  )
}
```

Nota para el implementador: `getTransactionsForUser` devuelve `status` en cada fila (el modelo completo), no hace falta cambiar `lib/transactions.ts`. `getCategoriesForUser` devuelve `kind` e `icon`.

- [ ] **Step 6: Verificación manual + suite**

Run: `npx vitest run`
Expected: toda la suite verde (los tests de página no existen; los de componentes y libs cubren las piezas).

Run: `npx tsc --noEmit` (si el repo no tiene script typecheck, este comando directo)
Expected: sin errores de tipos.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/movimientos/page.tsx" lib/dashboard.ts tests/dashboard.test.ts
git commit -m "feat: pestaña Recurrentes en /movimientos + materialización en página y dashboard"
```

---

### Task 8: e2e Playwright + suite completa

**Files:**
- Create: `tests/e2e/recurrentes.spec.ts`

**Interfaces:**
- Consumes: flujo completo de Tasks 1-7; selectores de registro/cuenta copiados de `tests/e2e/movimientos.spec.ts`.
- Produces: cobertura e2e del ciclo regla → PENDING → confirmar → saldo.

- [ ] **Step 1: Escribir el e2e**

Crear `tests/e2e/recurrentes.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('recurrencia: crear regla, ver la ocurrencia y confirmarla', async ({ page }) => {
  const email = `e2e_rec_${Date.now()}@growly.app`
  // registro
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Rec')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // cuenta con saldo inicial
  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  // nueva recurrencia mensual con primera fecha = hoy (default del diálogo)
  await page.goto('/movimientos?vista=recurrentes')
  await page.getByRole('button', { name: 'Nueva recurrencia' }).click()
  await page.getByLabel('Importe').fill('16')
  await page.getByLabel('Descripción').fill('Netflix')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(/Cada mes/)).toBeVisible()

  // en la vista Movimientos, la ocurrencia de hoy aparece como PENDING
  // (con fecha = hoy a medianoche UTC queda <= ahora → "Vencido" y confirmable)
  await page.goto('/movimientos')
  await expect(page.getByText('Netflix')).toBeVisible()
  await expect(page.getByText('Vencido')).toBeVisible()

  // confirmar → CLEARED → el saldo de la cuenta baja
  await page.getByRole('button', { name: 'Confirmar' }).first().click()
  await expect(page.getByText('Vencido')).not.toBeVisible()
  await page.goto('/cuentas')
  // aparece en la fila de la cuenta y en el patrimonio neto → .first() por strict mode
  await expect(page.getByText('$984.00').first()).toBeVisible()
})
```

(Nota: si la máquina corre en una zona horaria muy al este (UTC+12+) la ocurrencia de hoy podría quedar "Programado" en vez de "Vencido"; la máquina de desarrollo está en UTC-6, donde siempre queda vencida.)

- [ ] **Step 2: Ejecutar el e2e**

Run: `npx playwright test tests/e2e/recurrentes.spec.ts`
Expected: PASS (playwright.config levanta `next dev` con `workers: 1`).

- [ ] **Step 3: Suite completa (gate de cierre)**

Run: `npx vitest run`
Expected: todo verde.

Run: `npx playwright test`
Expected: los 5 e2e verdes (4 existentes + recurrentes).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/recurrentes.spec.ts
git commit -m "test: e2e de recurrencias — regla, ocurrencia PENDING y confirmación"
```

---

## Verificación final del sub-plan (checklist de cierre)

- [ ] `npx vitest run`: verde
- [ ] `npx playwright test`: verde
- [ ] `npx tsc --noEmit`: sin errores
- [ ] Revisión manual en navegador: crear regla mensual → pestaña Movimientos muestra la ocurrencia; dashboard muestra el pago en "Próximos pagos" y lo resta en "Comprometido"; pausar la regla elimina las futuras; confirmar un vencido baja el saldo en `/cuentas`.
