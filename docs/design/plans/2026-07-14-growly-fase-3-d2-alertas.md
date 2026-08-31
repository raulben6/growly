# Growly Fase 3 · D2: Alertas + Notificaciones · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Motor de alertas perezoso e idempotente (presupuesto 85%/excedido, pagos PENDING por vencer/vencidos, pago de tarjeta próximo) que persiste notificaciones in-app con estado leído/no-leído, campana con badge en el topbar y centro `/notificaciones` según el diseño móvil. Al mergear, la Fase 3 queda COMPLETA.

**Architecture:** modelo `Notification` con `dedupeKey` único por usuario; `lib/alerts.ts` puro calcula candidatas con claves estables; `lib/notifications.ts` las persiste con `createMany skipDuplicates` (idempotente, patrón materialize/auto-copia) y expone lecturas/mutaciones scoped; `lib/notification-actions.ts` con Zod. Triggers: `getDashboardData` construye el input con los datos que YA tiene cargados (cero queries extra) y la página `/notificaciones` usa la evaluación autónoma. La campana es un `Link` con badge cuyo count obtiene el layout.

**Tech Stack:** Next.js 16 App Router, Prisma 6.19.3 + Neon, Zod 4, Vitest + RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-growly-fase-3-design.md` (secciones 2, 3, 4, 5, 7, 8, sub-plan D2).

**Rama:** `feature/fase-3-d2` desde `master`. Merge a `master` tras el review final de rama.

## Global Constraints

- **Multi-tenant:** todo scoped por `userId` de `auth()`; mutaciones con `updateMany` + `where: { id, userId }`; ids de actions por `idSchema` (existente en validators). Mensajes en español.
- **Idempotencia:** unique `[userId, dedupeKey]` + `createMany({ skipDuplicates: true })`. Cada condición notifica UNA vez; los copys se congelan al crear (el diseño muestra texto estático). Confirmar/borrar el dato origen NO borra la notificación (historial).
- **Claves estables (spec §5.1):** `budget-85-<YYYY-MM>`, `budget-over-<YYYY-MM>` (mes humano vía `monthParam` de lib/month-param), `tx-due-<txId>`, `tx-overdue-<txId>`, `card-due-<accountId>-<YYYY-MM del vencimiento>`.
- **Umbrales exactos:** WARN `85 ≤ pct ≤ 100`; OVER `pct > 100` (pct redondeado de `budgetProgress`, consistente con card/página). PAYMENT_DUE `0 < date−now ≤ 3 días` (instantes); OVERDUE `date ≤ now`. CARD_DUE: próximo `dueDay` (ajustado al último día del mes si no existe) a ≤5 días del día de calendario local de hoy, y `used > 0`.
- **Fechas:** `Transaction.date` = fecha-calendario UTC (comparaciones por instante contra `now`, como el badge Vencido). `Notification.createdAt` = INSTANTE real → `relativeTimeLabel` usa getters LOCALES para mostrar (corrección documentada de la spec §5.1: un instante no es fecha-calendario). El "hoy" de tarjetas usa componentes locales de `now` + `daysInMonth` (convención C4).
- **Trigger sin queries extra en el dashboard:** `getDashboardData` construye `AlertInput` con `txns`/`accounts`/`progress` ya cargados y llama `persistAlertCandidates`. La evaluación autónoma (`evaluateAlertsForUser`, con sus propias queries) es solo para `/notificaciones`.
- **UI (diseño móvil isNotif):** chips "Todas | No leídas · N" (`?f=noleidas`), tarjetas con icono 40px tintado por tipo (WARN ámbar `bg-warning/15 text-warning`, resto rojo `bg-destructive/15 text-destructive`), título bold, cuerpo muted, tiempo relativo, dot `bg-acc` de no-leída, leídas con `opacity-60`, click en no-leída la marca. `/notificaciones` NO entra en NAV_ITEMS (se llega por la campana). "Nuevo inicio de sesión" del diseño queda FUERA.
- **Tests:** reloj fijado `toFake:['Date']` donde "hoy"/"hace N h" importen; anclas de tiempo a mediodía LOCAL (`new Date(y, m, d, 12)`) para que los tests de instantes sean portables entre offsets; fechas-calendario de datos con `Date.UTC` de los componentes locales de hoy cuando el test dependa del "mes actual" (evita el flake de boundary conocido). DB: `describe.skipIf(!process.env.DATABASE_URL)`; timeouts Neon → `--testTimeout=20000` y anotarlo.
- **Next.js 16:** `searchParams` Promise (await). Prisma pinned 6.19.3; `.env` intocable. Lint baseline: 1 error pre-existente en category-donut.tsx. Commits `feat:`/`test:`/`fix:` en español.

---

### Task 1: Schema Prisma, `Notification` + enum + migración

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/notification-schema.test.ts`

**Interfaces:**
- Consumes: modelo `User`.
- Produces: enum `NotificationType` (`BUDGET_WARN|BUDGET_OVER|PAYMENT_DUE|PAYMENT_OVERDUE|CARD_DUE`), modelo `Notification` (id, userId, type, title, body, dedupeKey, readAt?, createdAt) con unique `[userId, dedupeKey]` e index `[userId, createdAt]`; `User` gana `notifications Notification[]`. Tasks 3-4 dependen del nombre del unique compuesto `userId_dedupeKey`.

- [ ] **Step 1: Escribir el test (falla porque el modelo no existe)**

Crear `tests/notification-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('schema Notification', () => {
  it('el cliente expone notification', async () => {
    const count = await prisma.notification.count()
    expect(typeof count).toBe('number')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run tests/notification-schema.test.ts`
Expected: FAIL, `prisma.notification` es `undefined`.

- [ ] **Step 3: Añadir el schema**

En `prisma/schema.prisma`, añadir al final (verbatim de la spec §4):

```prisma
enum NotificationType {
  BUDGET_WARN
  BUDGET_OVER
  PAYMENT_DUE
  PAYMENT_OVERDUE
  CARD_DUE
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  type      NotificationType
  title     String
  body      String
  dedupeKey String // clave estable de la condición; garantiza idempotencia
  readAt    DateTime? // null = no leída
  createdAt DateTime         @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, dedupeKey])
  @@index([userId, createdAt])
}
```

y en `model User` (junto a `goals`/`goalContributions`): `notifications Notification[]`. Ejecutar `npx prisma format`.

- [ ] **Step 4: Migración y verificar que pasa**

Run: `npx prisma migrate dev --name notifications`
Run: `npx vitest run tests/notification-schema.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/notification-schema.test.ts
git commit -m "feat: modelo Notification con dedupeKey único por usuario"
```

---

### Task 2: `lib/alerts.ts` puro, candidatas de alerta + tiempo relativo

**Files:**
- Create: `lib/alerts.ts`
- Test: `tests/alerts.test.ts`

**Interfaces:**
- Consumes: `formatMoney` (lib/money), `daysInMonth` (lib/calendar), `monthParam`/`YearMonth` (lib/month-param).
- Produces (Tasks 3, 5, 6 dependen de estos nombres exactos):
  - `type AlertType = 'BUDGET_WARN' | 'BUDGET_OVER' | 'PAYMENT_DUE' | 'PAYMENT_OVERDUE' | 'CARD_DUE'`
  - `type AlertCandidate = { type: AlertType; title: string; body: string; dedupeKey: string }`
  - `type AlertInput = { budget: { pct: number; spent: number; limit: number } | null; pendingTxns: { id: string; description: string; amount: number; date: Date }[]; cards: { id: string; name: string; dueDay: number | null; used: number }[] }`
  - `alertCandidates(input: AlertInput, now: Date): AlertCandidate[]`
  - `nextCardDueDate(dueDay: number, now: Date): { year: number; month: number; day: number }`
  - `relativeTimeLabel(date: Date, now: Date): string`: 'Ahora' (<1 min) · 'Hace N min' · 'Hace N h' (mismo día local) · 'Ayer' · 'D mes'.

- [ ] **Step 1: Escribir los tests**

Crear `tests/alerts.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { alertCandidates, nextCardDueDate, relativeTimeLabel, type AlertInput } from '@/lib/alerts'

// Ancla a mediodía LOCAL: portable para offsets -12..+11 y estable en las comparaciones
// de instantes contra fechas-calendario UTC.
const now = new Date(2026, 6, 12, 12) // 12 jul 2026, 12:00 local

const empty: AlertInput = { budget: null, pendingTxns: [], cards: [] }
const d = (day: number) => new Date(Date.UTC(2026, 6, day))

describe('alertCandidates · presupuesto', () => {
  const budget = (pct: number) => ({ ...empty, budget: { pct, spent: pct * 1_000, limit: 100_000 } })
  it('84 → nada; 85 y 100 → WARN; 101 → OVER (sin WARN)', () => {
    expect(alertCandidates(budget(84), now)).toEqual([])
    expect(alertCandidates(budget(85), now)).toMatchObject([
      { type: 'BUDGET_WARN', dedupeKey: 'budget-85-2026-07', body: 'Llevas el 85% de tu presupuesto de julio.' },
    ])
    expect(alertCandidates(budget(100), now)[0].type).toBe('BUDGET_WARN')
    const over = alertCandidates(budget(101), now)
    expect(over).toHaveLength(1)
    expect(over[0]).toMatchObject({
      type: 'BUDGET_OVER',
      title: 'Presupuesto de julio superado',
      dedupeKey: 'budget-over-2026-07',
      body: 'Llevas el 101% del límite ($1,010 de $1,000).',
    })
  })
  it('sin presupuesto → nada', () => {
    expect(alertCandidates(empty, now)).toEqual([])
  })
})

describe('alertCandidates · pagos PENDING', () => {
  const withTx = (date: Date): AlertInput => ({
    ...empty,
    pendingTxns: [{ id: 't1', description: 'Alquiler', amount: 120_000, date }],
  })
  it('mañana → DUE singular; en 3 días → DUE; en 4 → nada; hoy medianoche UTC → OVERDUE', () => {
    expect(alertCandidates(withTx(d(13)), now)).toMatchObject([
      { type: 'PAYMENT_DUE', dedupeKey: 'tx-due-t1', body: 'Alquiler ($1,200.00) vence en 1 día.' },
    ])
    expect(alertCandidates(withTx(d(15)), now)[0].body).toContain('vence en 3 días')
    expect(alertCandidates(withTx(d(16)), now)).toEqual([])
    expect(alertCandidates(withTx(d(12)), now)).toMatchObject([
      { type: 'PAYMENT_OVERDUE', dedupeKey: 'tx-overdue-t1', title: 'Pago vencido' },
    ])
  })
})

describe('alertCandidates · tarjetas', () => {
  const withCard = (dueDay: number | null, used = 64_000): AlertInput => ({
    ...empty,
    cards: [{ id: 'a1', name: 'Visa', dueDay, used }],
  })
  it('dueDay a 3 días → CARD_DUE con clave del mes del vencimiento', () => {
    expect(alertCandidates(withCard(15), now)).toMatchObject([
      {
        type: 'CARD_DUE',
        dedupeKey: 'card-due-a1-2026-07',
        body: 'El pago de Visa ($640) vence el 15 de julio.',
      },
    ])
  })
  it('a 6 días → nada; dueDay ya pasado → mes siguiente (lejos) → nada; hoy → CARD_DUE', () => {
    expect(alertCandidates(withCard(18), now)).toEqual([])
    expect(alertCandidates(withCard(10), now)).toEqual([]) // 10 ago: a 29 días
    expect(alertCandidates(withCard(12), now)[0].type).toBe('CARD_DUE')
  })
  it('sin saldo usado o sin dueDay → nada', () => {
    expect(alertCandidates(withCard(15, 0), now)).toEqual([])
    expect(alertCandidates(withCard(null), now)).toEqual([])
  })
  it('ajuste fin de mes: dueDay 31 en junio → 30 jun', () => {
    const juneNow = new Date(2026, 5, 28, 12)
    expect(alertCandidates(withCard(31), juneNow)).toMatchObject([
      { dedupeKey: 'card-due-a1-2026-06', body: 'El pago de Visa ($640) vence el 30 de junio.' },
    ])
  })
})

describe('nextCardDueDate', () => {
  it('este mes si no ha pasado; si pasó, el siguiente (con ajuste)', () => {
    expect(nextCardDueDate(15, now)).toEqual({ year: 2026, month: 6, day: 15 })
    expect(nextCardDueDate(10, now)).toEqual({ year: 2026, month: 7, day: 10 })
    expect(nextCardDueDate(31, new Date(2026, 5, 28, 12))).toEqual({ year: 2026, month: 5, day: 30 })
    expect(nextCardDueDate(31, new Date(2026, 11, 31, 12))).toEqual({ year: 2026, month: 11, day: 31 })
  })
})

describe('relativeTimeLabel', () => {
  it('ahora / minutos / horas / ayer / fecha', () => {
    expect(relativeTimeLabel(new Date(now.getTime() - 30_000), now)).toBe('Ahora')
    expect(relativeTimeLabel(new Date(now.getTime() - 5 * 60_000), now)).toBe('Hace 5 min')
    expect(relativeTimeLabel(new Date(2026, 6, 12, 9), now)).toBe('Hace 3 h')
    expect(relativeTimeLabel(new Date(2026, 6, 11, 20), now)).toBe('Ayer')
    expect(relativeTimeLabel(new Date(2026, 6, 3, 9), now)).toBe('3 jul')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/alerts.test.ts`
Expected: FAIL, `Cannot find module '@/lib/alerts'`.

- [ ] **Step 3: Implementar**

Crear `lib/alerts.ts`:

```ts
import { formatMoney } from '@/lib/money'
import { daysInMonth } from '@/lib/calendar'
import { monthParam, type YearMonth } from '@/lib/month-param'

export type AlertType = 'BUDGET_WARN' | 'BUDGET_OVER' | 'PAYMENT_DUE' | 'PAYMENT_OVERDUE' | 'CARD_DUE'

export type AlertCandidate = { type: AlertType; title: string; body: string; dedupeKey: string }

export type AlertInput = {
  // totales del presupuesto del mes actual (budgetProgress.totals), o null si no hay presupuesto
  budget: { pct: number; spent: number; limit: number } | null
  // movimientos PENDING (date = fecha-calendario a medianoche UTC)
  pendingTxns: { id: string; description: string; amount: number; date: Date }[]
  // tarjetas de crédito activas con su saldo usado
  cards: { id: string; name: string; dueDay: number | null; used: number }[]
}

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DAY_MS = 86_400_000

// Próximo vencimiento de una tarjeta: el dueDay de este mes (ajustado al último día si no
// existe) o, si ya pasó respecto al día de calendario local de hoy, el del mes siguiente.
export function nextCardDueDate(dueDay: number, now: Date): { year: number; month: number; day: number } {
  let year = now.getFullYear()
  let month = now.getMonth()
  let day = Math.min(dueDay, daysInMonth(year, month))
  if (day < now.getDate()) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
    day = Math.min(dueDay, daysInMonth(year, month))
  }
  return { year, month, day }
}

// Reglas de la spec §5.1. Los copys se congelan al crear la notificación.
export function alertCandidates(input: AlertInput, now: Date): AlertCandidate[] {
  const out: AlertCandidate[] = []
  const ym: YearMonth = { year: now.getFullYear(), month: now.getMonth() }
  const monthKey = monthParam(ym)
  const mes = MESES_LARGOS[ym.month]

  if (input.budget) {
    const { pct, spent, limit } = input.budget
    if (pct >= 85 && pct <= 100) {
      out.push({
        type: 'BUDGET_WARN',
        title: 'Cerca del límite de presupuesto',
        body: `Llevas el ${pct}% de tu presupuesto de ${mes}.`,
        dedupeKey: `budget-85-${monthKey}`,
      })
    }
    if (pct > 100) {
      out.push({
        type: 'BUDGET_OVER',
        title: `Presupuesto de ${mes} superado`,
        body: `Llevas el ${pct}% del límite (${formatMoney(spent, { withCents: false })} de ${formatMoney(limit, { withCents: false })}).`,
        dedupeKey: `budget-over-${monthKey}`,
      })
    }
  }

  for (const t of input.pendingTxns) {
    const diff = t.date.getTime() - now.getTime()
    if (diff <= 0) {
      out.push({
        type: 'PAYMENT_OVERDUE',
        title: 'Pago vencido',
        body: `${t.description} (${formatMoney(t.amount)}) está pendiente de confirmar.`,
        dedupeKey: `tx-overdue-${t.id}`,
      })
    } else if (diff <= 3 * DAY_MS) {
      const n = Math.ceil(diff / DAY_MS)
      out.push({
        type: 'PAYMENT_DUE',
        title: 'Pago próximo',
        body: `${t.description} (${formatMoney(t.amount)}) vence en ${n} ${n === 1 ? 'día' : 'días'}.`,
        dedupeKey: `tx-due-${t.id}`,
      })
    }
  }

  for (const c of input.cards) {
    if (!c.dueDay || c.used <= 0) continue
    const due = nextCardDueDate(c.dueDay, now)
    // días entre el día de calendario local de hoy y el del vencimiento (aritmética UTC exacta)
    const daysUntil = Math.round(
      (Date.UTC(due.year, due.month, due.day) - Date.UTC(ym.year, ym.month, now.getDate())) / DAY_MS,
    )
    if (daysUntil <= 5) {
      out.push({
        type: 'CARD_DUE',
        title: 'Pago de tarjeta próximo',
        body: `El pago de ${c.name} (${formatMoney(c.used, { withCents: false })}) vence el ${due.day} de ${MESES_LARGOS[due.month]}.`,
        dedupeKey: `card-due-${c.id}-${monthParam({ year: due.year, month: due.month })}`,
      })
    }
  }

  return out
}

// createdAt es un INSTANTE real (no fecha-calendario) → getters LOCALES para mostrar.
export function relativeTimeLabel(date: Date, now: Date): string {
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return 'Ahora'
  if (diff < 3_600_000) return `Hace ${Math.floor(diff / 60_000)} min`
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return `Hace ${Math.floor(diff / 3_600_000)} h`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (isYesterday) return 'Ayer'
  return `${date.getDate()} ${MESES_CORTOS[date.getMonth()]}`
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/alerts.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/alerts.ts tests/alerts.test.ts
git commit -m "feat: lib/alerts puro — candidatas con claves estables y tiempo relativo"
```

---

### Task 3: `lib/notifications.ts`, persistencia idempotente y lecturas scoped

**Files:**
- Create: `lib/notifications.ts`
- Test: `tests/notifications-db.test.ts`

**Interfaces:**
- Consumes: Task 1 (modelo), Task 2 (`alertCandidates`, tipos), `getBudgetsForMonth`/`budgetProgress`, `getTransactionsForUser`, `getAccountsWithBalances`.
- Produces (Tasks 4 y 6 dependen de estas firmas):
  - `persistAlertCandidates(userId: string, candidates: AlertCandidate[]): Promise<void>`: createMany skipDuplicates; no escribe si no hay candidatas.
  - `evaluateAlertsForUser(userId: string, now?: Date): Promise<void>`: carga presupuesto/PENDING/tarjetas y persiste (para `/notificaciones`).
  - `getNotificationsForUser(userId, opts?: { unreadOnly?: boolean })`: orden createdAt desc.
  - `getUnreadCountForUser(userId): Promise<number>`
  - `markNotificationReadForUser(userId, id, now?): Promise<{ ok: boolean }>`: solo si estaba no-leída.
  - `markAllNotificationsReadForUser(userId, now?): Promise<{ ok: true }>`

- [ ] **Step 1: Escribir los tests**

Crear `tests/notifications-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  persistAlertCandidates, evaluateAlertsForUser, getNotificationsForUser,
  getUnreadCountForUser, markNotificationReadForUser, markAllNotificationsReadForUser,
} from '@/lib/notifications'

const email = `notif_${Date.now()}@growly.app`
let userId = ''
let otherId = ''
let accountId = ''
let catId = ''

// fecha-calendario de HOY (componentes locales → medianoche UTC): cae en el mes actual
// bajo getters UTC en cualquier momento del mes.
const now = new Date()
const hoyUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

describe.skipIf(!process.env.DATABASE_URL)('notifications DB', () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { name: 'Notif', email } })).id
    otherId = (await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })).id
    accountId = (await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING' } })).id
    catId = (await prisma.category.create({ data: { userId, name: 'NotifComida', kind: 'EXPENSE' } })).id
    await prisma.budget.create({
      data: { userId, categoryId: catId, year: now.getFullYear(), month: now.getMonth(), amount: 100_000 },
    })
    await prisma.transaction.create({
      data: {
        userId, accountId, categoryId: catId, type: 'EXPENSE', amount: 86_000,
        description: 'Súper', date: hoyUTC, status: 'CLEARED',
      },
    })
  })
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.budget.deleteMany({ where: { userId } })
    await prisma.category.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('evaluateAlertsForUser crea la WARN del 86% y es idempotente', async () => {
    await evaluateAlertsForUser(userId, now)
    let list = await getNotificationsForUser(userId)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ type: 'BUDGET_WARN' })
    await evaluateAlertsForUser(userId, now)
    list = await getNotificationsForUser(userId)
    expect(list).toHaveLength(1) // sin duplicar
  })

  it('cruzar a excedido crea la OVER sin duplicar la WARN', async () => {
    await prisma.transaction.create({
      data: {
        userId, accountId, categoryId: catId, type: 'EXPENSE', amount: 20_000,
        description: 'Extra', date: hoyUTC, status: 'CLEARED',
      },
    })
    await evaluateAlertsForUser(userId, now)
    const list = await getNotificationsForUser(userId)
    expect(list).toHaveLength(2)
    expect(list.map((n) => n.type).sort()).toEqual(['BUDGET_OVER', 'BUDGET_WARN'])
  })

  it('un PENDING que vence pronto genera PAYMENT_DUE', async () => {
    const in2days = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) + 2 * 86_400_000)
    await prisma.transaction.create({
      data: {
        userId, accountId, type: 'EXPENSE', amount: 120_000,
        description: 'Alquiler', date: in2days, status: 'PENDING',
      },
    })
    await evaluateAlertsForUser(userId, now)
    const due = (await getNotificationsForUser(userId)).find((n) => n.type === 'PAYMENT_DUE')
    expect(due).toBeDefined()
    expect(due!.body).toContain('Alquiler')
  })

  it('unreadOnly, unreadCount, markRead con ownership y markAll', async () => {
    expect(await getUnreadCountForUser(userId)).toBe(3)
    const first = (await getNotificationsForUser(userId, { unreadOnly: true }))[0]
    expect(await markNotificationReadForUser(otherId, first.id)).toEqual({ ok: false })
    expect(await markNotificationReadForUser(userId, first.id)).toEqual({ ok: true })
    expect(await markNotificationReadForUser(userId, first.id)).toEqual({ ok: false }) // ya leída
    expect(await getUnreadCountForUser(userId)).toBe(2)
    expect(await getNotificationsForUser(userId, { unreadOnly: true })).toHaveLength(2)
    await markAllNotificationsReadForUser(userId)
    expect(await getUnreadCountForUser(userId)).toBe(0)
  })

  it('persistAlertCandidates sin candidatas no escribe', async () => {
    const before = await prisma.notification.count({ where: { userId } })
    await persistAlertCandidates(userId, [])
    expect(await prisma.notification.count({ where: { userId } })).toBe(before)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/notifications-db.test.ts`
Expected: FAIL, `Cannot find module '@/lib/notifications'`.

- [ ] **Step 3: Implementar**

Crear `lib/notifications.ts`:

```ts
import { prisma } from '@/lib/prisma'
import { alertCandidates, type AlertCandidate, type AlertInput } from '@/lib/alerts'
import { getBudgetsForMonth, budgetProgress } from '@/lib/budgets'
import { getTransactionsForUser } from '@/lib/transactions'
import { getAccountsWithBalances } from '@/lib/accounts'

// Inserta candidatas de forma idempotente: unique [userId, dedupeKey] + skipDuplicates
// (patrón materialize/auto-copia). Cada condición notifica UNA sola vez.
export async function persistAlertCandidates(userId: string, candidates: AlertCandidate[]) {
  if (candidates.length === 0) return
  await prisma.notification.createMany({
    data: candidates.map((c) => ({ ...c, userId })),
    skipDuplicates: true,
  })
}

// Evaluación autónoma (la usa /notificaciones). El dashboard NO la usa: construye el
// input con los datos que ya tiene cargados y llama persistAlertCandidates directo.
export async function evaluateAlertsForUser(userId: string, now: Date = new Date()) {
  const [budgets, txns, { accounts }] = await Promise.all([
    getBudgetsForMonth(userId, now.getFullYear(), now.getMonth(), now),
    getTransactionsForUser(userId),
    getAccountsWithBalances(userId),
  ])
  const progress = budgetProgress(budgets, txns, now.getFullYear(), now.getMonth())
  const input: AlertInput = {
    budget: budgets.length > 0 ? progress.totals : null,
    pendingTxns: txns
      .filter((t) => t.status === 'PENDING')
      .map((t) => ({ id: t.id, description: t.description, amount: t.amount, date: t.date })),
    cards: accounts
      .filter((a) => a.type === 'CREDIT_CARD')
      .map((a) => ({ id: a.id, name: a.name, dueDay: a.dueDay, used: a.utilization?.used ?? 0 })),
  }
  await persistAlertCandidates(userId, alertCandidates(input, now))
}

export function getNotificationsForUser(userId: string, opts: { unreadOnly?: boolean } = {}) {
  return prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
  })
}

export function getUnreadCountForUser(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } })
}

export async function markNotificationReadForUser(userId: string, id: string, now: Date = new Date()) {
  const res = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: now },
  })
  return { ok: res.count > 0 }
}

export async function markAllNotificationsReadForUser(userId: string, now: Date = new Date()) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: now },
  })
  return { ok: true as const }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/notifications-db.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notifications.ts tests/notifications-db.test.ts
git commit -m "feat: persistencia idempotente de alertas y lecturas de notificaciones"
```

---

### Task 4: `lib/notification-actions.ts`

**Files:**
- Create: `lib/notification-actions.ts`
- Test: `tests/notification-actions.test.ts`

**Interfaces:**
- Consumes: Task 3 (`markNotificationReadForUser`, `markAllNotificationsReadForUser`), `idSchema` (validators), `auth`.
- Produces (Task 5 las consume): `markNotificationRead(id: unknown)` y `markAllNotificationsRead()` → `{ ok: true } | { ok: false, error: string }`, con `revalidatePath('/notificaciones')` y `revalidatePath('/')`.

- [ ] **Step 1: Escribir los tests**

Crear `tests/notification-actions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const email = `notifact_${Date.now()}@growly.app`
let userId = ''
let otherId = ''

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { markNotificationRead, markAllNotificationsRead } from '@/lib/notification-actions'

const notif = (uid: string, key: string) => ({
  userId: uid, type: 'BUDGET_WARN' as const, title: 'T', body: 'B', dedupeKey: key,
})

describe.skipIf(!process.env.DATABASE_URL)('notification actions', () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { name: 'NA', email } })).id
    otherId = (await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })).id
    await prisma.notification.createMany({
      data: [notif(userId, 'k1'), notif(userId, 'k2'), notif(otherId, 'k1')],
    })
  })
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('markNotificationRead valida id y ownership', async () => {
    expect(await markNotificationRead(123)).toEqual({ ok: false, error: 'Datos inválidos' })
    const ajena = await prisma.notification.findFirst({ where: { userId: otherId } })
    expect(await markNotificationRead(ajena!.id)).toEqual({ ok: false, error: 'Notificación no encontrada' })
    const propia = await prisma.notification.findFirst({ where: { userId } })
    expect(await markNotificationRead(propia!.id)).toEqual({ ok: true })
    expect((await prisma.notification.findUnique({ where: { id: propia!.id } }))!.readAt).not.toBeNull()
  })

  it('markAllNotificationsRead deja 0 no leídas (y no toca a otros usuarios)', async () => {
    expect(await markAllNotificationsRead()).toEqual({ ok: true })
    expect(await prisma.notification.count({ where: { userId, readAt: null } })).toBe(0)
    expect(await prisma.notification.count({ where: { userId: otherId, readAt: null } })).toBe(1)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/notification-actions.test.ts`
Expected: FAIL, `Cannot find module '@/lib/notification-actions'`.

- [ ] **Step 3: Implementar**

Crear `lib/notification-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { idSchema } from '@/lib/validators'
import { markNotificationReadForUser, markAllNotificationsReadForUser } from '@/lib/notifications'

function revalidate() {
  revalidatePath('/notificaciones')
  revalidatePath('/')
}

export async function markNotificationRead(id: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false as const, error: 'Datos inválidos' }
  try {
    const res = await markNotificationReadForUser(session.user.id, parsedId.data)
    if (!res.ok) return { ok: false as const, error: 'Notificación no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo marcar la notificación' }
  }
  revalidate()
  return { ok: true as const }
}

export async function markAllNotificationsRead() {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  try {
    await markAllNotificationsReadForUser(session.user.id)
  } catch {
    return { ok: false as const, error: 'No se pudieron marcar las notificaciones' }
  }
  revalidate()
  return { ok: true as const }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/notification-actions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/notification-actions.ts tests/notification-actions.test.ts
git commit -m "feat: actions de notificaciones con zod en ids"
```

---

### Task 5: Componentes, `NotificationsBell`, `NotificationCard`, `MarkAllReadButton`

**Files:**
- Create: `components/growly/notifications-bell.tsx`
- Create: `components/growly/notification-card.tsx`
- Create: `components/growly/mark-all-read-button.tsx`
- Test: `tests/notification-components.test.tsx`

**Interfaces:**
- Consumes: Task 4 (actions), iconos lucide (`Bell`, `Receipt`, `CreditCard`, `TriangleAlert`).
- Produces (Task 6 las consume):
  - `NotificationsBell({ unread: number })`: Link a `/notificaciones`, badge rojo con el número (oculto si 0; `99+` si >99), `aria-label` con el count.
  - `type NotificationView = { id: string; type: AlertType-like; title: string; body: string; timeLabel: string; read: boolean }`
  - `NotificationCard({ n: NotificationView })`: botón: icono tintado por tipo (WARN ámbar, resto rojo), título/cuerpo/tiempo, dot `bg-acc` si no leída, `opacity-60` + disabled si leída; click en no-leída llama `markNotificationRead(n.id)`; error visible.
  - `MarkAllReadButton()`: llama `markAllNotificationsRead`, error visible.

- [ ] **Step 1: Escribir los tests**

Crear `tests/notification-components.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsBell } from '@/components/growly/notifications-bell'
import { NotificationCard, type NotificationView } from '@/components/growly/notification-card'
import { MarkAllReadButton } from '@/components/growly/mark-all-read-button'
import { markNotificationRead, markAllNotificationsRead } from '@/lib/notification-actions'

vi.mock('@/lib/notification-actions', () => ({
  markNotificationRead: vi.fn(async () => ({ ok: true })),
  markAllNotificationsRead: vi.fn(async () => ({ ok: true })),
}))

beforeEach(() => vi.clearAllMocks())

const base: NotificationView = {
  id: 'n1', type: 'BUDGET_WARN', title: 'Cerca del límite de presupuesto',
  body: 'Llevas el 86% de tu presupuesto de julio.', timeLabel: 'Hace 2 h', read: false,
}

describe('NotificationsBell', () => {
  it('sin badge con 0; número con >0; 99+ con >99; link a /notificaciones', () => {
    const { rerender } = render(<NotificationsBell unread={0} />)
    expect(screen.queryByTestId('bell-badge')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Notificaciones' })).toHaveAttribute('href', '/notificaciones')
    rerender(<NotificationsBell unread={3} />)
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: 'Notificaciones: 3 sin leer' })).toBeInTheDocument()
    rerender(<NotificationsBell unread={120} />)
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('99+')
  })
})

describe('NotificationCard', () => {
  it('no leída: dot visible y el click la marca', async () => {
    const user = userEvent.setup()
    render(<NotificationCard n={base} />)
    expect(screen.getByTestId('dot-n1')).toBeInTheDocument()
    expect(screen.getByText('Hace 2 h')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Cerca del límite/ }))
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n1'))
  })

  it('leída: opacidad, sin dot y sin click', async () => {
    const user = userEvent.setup()
    render(<NotificationCard n={{ ...base, read: true }} />)
    expect(screen.queryByTestId('dot-n1')).not.toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /Cerca del límite/ })
    expect(btn).toBeDisabled()
    expect(btn.className).toContain('opacity-60')
    await user.click(btn)
    expect(markNotificationRead).not.toHaveBeenCalled()
  })

  it('tinte por tipo: WARN ámbar, OVER rojo', () => {
    const { rerender } = render(<NotificationCard n={base} />)
    expect(screen.getByTestId('icon-n1').className).toContain('text-warning')
    rerender(<NotificationCard n={{ ...base, type: 'BUDGET_OVER' }} />)
    expect(screen.getByTestId('icon-n1').className).toContain('text-destructive')
  })

  it('muestra el error de la action', async () => {
    vi.mocked(markNotificationRead).mockResolvedValueOnce({ ok: false, error: 'No se pudo marcar la notificación' })
    const user = userEvent.setup()
    render(<NotificationCard n={base} />)
    await user.click(screen.getByRole('button', { name: /Cerca del límite/ }))
    expect(await screen.findByText('No se pudo marcar la notificación')).toBeInTheDocument()
  })
})

describe('MarkAllReadButton', () => {
  it('llama a la action', async () => {
    const user = userEvent.setup()
    render(<MarkAllReadButton />)
    await user.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }))
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled())
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/notification-components.test.tsx`
Expected: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar**

Crear `components/growly/notifications-bell.tsx`:

```tsx
import Link from 'next/link'
import { Bell } from 'lucide-react'

export function NotificationsBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/notificaciones"
      aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'}
      className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card"
    >
      <Bell size={20} aria-hidden />
      {unread > 0 && (
        <span
          data-testid="bell-badge"
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-extrabold text-white"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
```

Crear `components/growly/notification-card.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { CreditCard, Receipt, TriangleAlert } from 'lucide-react'
import { markNotificationRead } from '@/lib/notification-actions'

export type NotificationView = {
  id: string
  type: 'BUDGET_WARN' | 'BUDGET_OVER' | 'PAYMENT_DUE' | 'PAYMENT_OVERDUE' | 'CARD_DUE'
  title: string
  body: string
  timeLabel: string
  read: boolean
}

const ICON = {
  BUDGET_WARN: { Icon: TriangleAlert, cls: 'bg-warning/15 text-warning' },
  BUDGET_OVER: { Icon: TriangleAlert, cls: 'bg-destructive/15 text-destructive' },
  PAYMENT_DUE: { Icon: Receipt, cls: 'bg-destructive/15 text-destructive' },
  PAYMENT_OVERDUE: { Icon: Receipt, cls: 'bg-destructive/15 text-destructive' },
  CARD_DUE: { Icon: CreditCard, cls: 'bg-destructive/15 text-destructive' },
} as const

export function NotificationCard({ n }: { n: NotificationView }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const { Icon, cls } = ICON[n.type]
  return (
    <button
      type="button"
      disabled={pending || n.read}
      onClick={() =>
        start(async () => {
          const res = await markNotificationRead(n.id)
          setError(res.ok ? null : res.error)
        })
      }
      className={`flex w-full items-start gap-3 rounded-[16px] border border-border bg-card p-4 text-left shadow-[var(--shadow-card)] ${
        n.read ? 'opacity-60' : 'hover:bg-muted/40'
      }`}
    >
      <span
        data-testid={`icon-${n.id}`}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cls}`}
        aria-hidden
      >
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-foreground">{n.title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{n.body}</span>
        <span className="mt-1.5 block text-[11px] text-muted-foreground/70">{n.timeLabel}</span>
        {error && <span className="mt-1 block text-[11px] font-bold text-destructive">{error}</span>}
      </span>
      {!n.read && (
        <span data-testid={`dot-${n.id}`} className="mt-1 h-2 w-2 shrink-0 rounded-full bg-acc" aria-hidden />
      )}
    </button>
  )
}
```

Crear `components/growly/mark-all-read-button.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { markAllNotificationsRead } from '@/lib/notification-actions'

export function MarkAllReadButton() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs font-bold text-destructive">{error}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await markAllNotificationsRead()
            setError(res.ok ? null : res.error)
          })
        }
        className="rounded-[11px] border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"
      >
        Marcar todas como leídas
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/notification-components.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add components/growly/notifications-bell.tsx components/growly/notification-card.tsx components/growly/mark-all-read-button.tsx tests/notification-components.test.tsx
git commit -m "feat: campana con badge y tarjetas de notificación"
```

---

### Task 6: Página `/notificaciones` + campana cableada + trigger del dashboard

**Files:**
- Create: `app/(app)/notificaciones/page.tsx`
- Modify: `components/growly/topbar.tsx` (prop `unread`, usar `NotificationsBell`)
- Modify: `app/(app)/layout.tsx` (obtener `unread` y pasarlo)
- Modify: `lib/dashboard.ts` (persistir candidatas con los datos ya cargados)
- Test: `tests/notificaciones-page.test.tsx`
- Test: Modify `tests/dashboard.test.ts` (describe nuevo al final)

**Interfaces:**
- Consumes: Tasks 2-5 completas.
- Produces: ruta `/notificaciones` (fuera de NAV_ITEMS), badge vivo en el topbar, alertas generadas al cargar el dashboard.

- [ ] **Step 1: Tests (RED)**

1. Crear `tests/notificaciones-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/notification-actions', () => ({
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))

const getNotificationsForUser = vi.fn()
const getUnreadCountForUser = vi.fn()
const evaluateAlertsForUser = vi.fn(async () => {})
vi.mock('@/lib/notifications', () => ({
  getNotificationsForUser: (...a: unknown[]) => getNotificationsForUser(...a),
  getUnreadCountForUser: (...a: unknown[]) => getUnreadCountForUser(...a),
  evaluateAlertsForUser: (...a: unknown[]) => evaluateAlertsForUser(...a),
}))

import NotificacionesPage from '@/app/(app)/notificaciones/page'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 12, 12))
})
afterAll(() => vi.useRealTimers())
beforeEach(() => {
  getNotificationsForUser.mockReset()
  getUnreadCountForUser.mockReset()
  evaluateAlertsForUser.mockClear()
})

const n = (over: Record<string, unknown>) => ({
  id: 'n1', userId: 'u1', type: 'BUDGET_WARN', title: 'Cerca del límite de presupuesto',
  body: 'Llevas el 86% de tu presupuesto de julio.', dedupeKey: 'k',
  readAt: null, createdAt: new Date(2026, 6, 12, 10), ...over,
})

describe('página /notificaciones', () => {
  it('evalúa, lista con tiempo relativo y chips con conteo', async () => {
    getNotificationsForUser.mockResolvedValue([
      n({}),
      n({ id: 'n2', type: 'PAYMENT_DUE', title: 'Pago próximo', readAt: new Date(2026, 6, 12, 11) }),
    ])
    getUnreadCountForUser.mockResolvedValue(1)
    render(await NotificacionesPage({ searchParams: Promise.resolve({}) }))
    expect(evaluateAlertsForUser).toHaveBeenCalledWith('u1', expect.any(Date))
    expect(screen.getByText('Cerca del límite de presupuesto')).toBeInTheDocument()
    expect(screen.getByText('Hace 2 h')).toBeInTheDocument()
    expect(screen.getByTestId('dot-n1')).toBeInTheDocument()
    expect(screen.queryByTestId('dot-n2')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /No leídas · 1/ })).toHaveAttribute(
      'href', '/notificaciones?f=noleidas',
    )
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeInTheDocument()
  })

  it('filtro no leídas pide unreadOnly y el vacío filtrado tiene su copy', async () => {
    getNotificationsForUser.mockResolvedValue([])
    getUnreadCountForUser.mockResolvedValue(0)
    render(await NotificacionesPage({ searchParams: Promise.resolve({ f: 'noleidas' }) }))
    expect(getNotificationsForUser).toHaveBeenCalledWith('u1', { unreadOnly: true })
    expect(screen.getByText('No tienes notificaciones sin leer.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar todas como leídas' })).not.toBeInTheDocument()
  })

  it('vacío total: copy de bienvenida', async () => {
    getNotificationsForUser.mockResolvedValue([])
    getUnreadCountForUser.mockResolvedValue(0)
    render(await NotificacionesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/Aquí verás avisos de presupuesto, pagos y tarjetas/)).toBeInTheDocument()
  })
})
```

2. Añadir al FINAL de `tests/dashboard.test.ts` (imports ya presentes; no duplicar):

```ts
describe.skipIf(!process.env.DATABASE_URL)('getDashboardData · alertas', () => {
  const email = `dashalert_${Date.now()}@growly.app`
  let uid = ''
  const now = new Date()
  const hoyUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

  beforeAll(async () => {
    uid = (await prisma.user.create({ data: { name: 'DashAlert', email } })).id
    const acc = await prisma.account.create({ data: { userId: uid, name: 'C', type: 'CHECKING' } })
    const cat = await prisma.category.create({ data: { userId: uid, name: 'DashAlertCat', kind: 'EXPENSE' } })
    await prisma.budget.create({
      data: { userId: uid, categoryId: cat.id, year: now.getFullYear(), month: now.getMonth(), amount: 100_000 },
    })
    await prisma.transaction.create({
      data: {
        userId: uid, accountId: acc.id, categoryId: cat.id, type: 'EXPENSE', amount: 86_000,
        description: 'Súper', date: hoyUTC, status: 'CLEARED',
      },
    })
  })
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: uid } })
    await prisma.transaction.deleteMany({ where: { userId: uid } })
    await prisma.budget.deleteMany({ where: { userId: uid } })
    await prisma.category.deleteMany({ where: { userId: uid } })
    await prisma.account.deleteMany({ where: { userId: uid } })
    await prisma.user.delete({ where: { id: uid } })
  })

  it('cargar el dashboard persiste la alerta del presupuesto sin duplicar', async () => {
    await getDashboardData(uid, now)
    await getDashboardData(uid, now)
    const notifs = await prisma.notification.findMany({ where: { userId: uid } })
    expect(notifs).toHaveLength(1)
    expect(notifs[0].type).toBe('BUDGET_WARN')
  })
})
```

Run: `npx vitest run tests/notificaciones-page.test.tsx tests/dashboard.test.ts`
Expected: FAIL, página inexistente; el dashboard aún no persiste alertas.

- [ ] **Step 2: Implementar**

1. Crear `app/(app)/notificaciones/page.tsx`:

```tsx
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import {
  evaluateAlertsForUser, getNotificationsForUser, getUnreadCountForUser,
} from '@/lib/notifications'
import { relativeTimeLabel } from '@/lib/alerts'
import { NotificationCard } from '@/components/growly/notification-card'
import { MarkAllReadButton } from '@/components/growly/mark-all-read-button'

const tabCls = (active: boolean) =>
  `rounded-[11px] px-4 py-2 text-sm font-bold ${
    active ? 'bg-forest text-white' : 'border border-border bg-card text-muted-foreground'
  }`

export default async function NotificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { f } = await searchParams
  const unreadOnly = f === 'noleidas'
  const now = new Date()

  await evaluateAlertsForUser(userId, now)
  const [items, unread] = await Promise.all([
    getNotificationsForUser(userId, { unreadOnly }),
    getUnreadCountForUser(userId),
  ])

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Notificaciones</h1>
        {unread > 0 && <MarkAllReadButton />}
      </div>

      <div className="flex gap-2">
        <Link href="/notificaciones" className={tabCls(!unreadOnly)}>Todas</Link>
        <Link href="/notificaciones?f=noleidas" className={tabCls(unreadOnly)}>
          No leídas · {unread}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">
            {unreadOnly
              ? 'No tienes notificaciones sin leer.'
              : 'Sin notificaciones. Aquí verás avisos de presupuesto, pagos y tarjetas.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <NotificationCard
              key={item.id}
              n={{
                id: item.id,
                type: item.type,
                title: item.title,
                body: item.body,
                timeLabel: relativeTimeLabel(item.createdAt, now),
                read: item.readAt !== null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

2. En `components/growly/topbar.tsx`, reemplazar TODO el contenido por:

```tsx
import { ThemeToggle } from './theme-toggle'
import { Plus } from 'lucide-react'
import { NotificationsBell } from './notifications-bell'

export function Topbar({ userName, unread }: { userName: string; unread: number }) {
  return (
    <header className="flex items-center justify-between mb-6">
      <div>
        <div className="text-sm text-muted-foreground font-semibold">Hoy</div>
        <div className="text-2xl font-extrabold tracking-[-0.02em]">Hola, {userName}</div>
      </div>
      <div className="flex items-center gap-3.5">
        <NotificationsBell unread={unread} />
        <ThemeToggle />
        <button className="h-11 px-4 rounded-xl bg-primary text-primary-foreground font-extrabold flex items-center gap-2">
          <Plus size={18} /> Añadir
        </button>
      </div>
    </header>
  )
}
```

3. En `app/(app)/layout.tsx`, reemplazar TODO el contenido por:

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/growly/sidebar'
import { Topbar } from '@/components/growly/topbar'
import { getUnreadCountForUser } from '@/lib/notifications'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const unread = await getUnreadCountForUser(session.user.id)
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 px-8 py-6">
        <Topbar userName={session.user.name?.split(' ')[0] ?? 'usuario'} unread={unread} />
        {children}
      </main>
    </div>
  )
}
```

4. En `lib/dashboard.ts`:

- Añadir a los imports:

```ts
import { alertCandidates } from '@/lib/alerts'
import { persistAlertCandidates } from '@/lib/notifications'
```

- Después del bloque que calcula `budget` (y antes de `cashflow`/`deltas`), añadir: usa `progress`, `txns` y `accounts` ya cargados (cero queries extra de lectura):

```ts
  // Alertas: evaluación perezosa con los datos ya cargados (spec F3 §5.2)
  await persistAlertCandidates(
    userId,
    alertCandidates(
      {
        budget: budgets.length > 0 ? progress.totals : null,
        pendingTxns: txns
          .filter((t) => t.status === 'PENDING')
          .map((t) => ({ id: t.id, description: t.description, amount: t.amount, date: t.date })),
        cards: accounts
          .filter((a) => a.type === 'CREDIT_CARD')
          .map((a) => ({ id: a.id, name: a.name, dueDay: a.dueDay, used: a.utilization?.used ?? 0 })),
      },
      now,
    ),
  )
```

- [ ] **Step 3: Verificar GREEN + lint + suite completa**

Run: `npx vitest run tests/notificaciones-page.test.tsx tests/dashboard.test.ts --testTimeout=20000`
Expected: PASS.

Run: `npm run lint`
Expected: sin errores nuevos sobre el baseline.

Run: `npx vitest run --testTimeout=20000`
Expected: TODA la suite verde.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/notificaciones/page.tsx" components/growly/topbar.tsx "app/(app)/layout.tsx" lib/dashboard.ts tests/notificaciones-page.test.tsx tests/dashboard.test.ts
git commit -m "feat: centro /notificaciones, campana con badge y alertas al cargar el dashboard"
```

---

### Task 7: e2e, alerta de presupuesto de punta a punta

**Files:**
- Test: `tests/e2e/notificaciones.spec.ts`

**Interfaces:**
- Consumes: flujo completo D2 + presupuesto de C2. Usa la categoría del sistema "Alimentación".

- [ ] **Step 1: Escribir el e2e**

Crear `tests/e2e/notificaciones.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('alerta de presupuesto: 86% → campana → centro → marcar leída', async ({ page }) => {
  const email = `e2e_notif_${Date.now()}@growly.app`
  const now = new Date()
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // registro + cuenta
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Notif')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  // presupuesto Alimentación $1,000
  await page.goto('/presupuesto')
  await page.getByRole('button', { name: /Añadir categoría/i }).click()
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimentación' })
  await page.getByLabel('Límite mensual').fill('1000')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(/Gastado de/)).toBeVisible()

  // gasto de $860 hoy → 86%
  await page.goto('/movimientos')
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByLabel('Importe').fill('860')
  await page.getByLabel('Descripción').fill('Súper')
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimentación' })
  await page.getByLabel('Fecha').fill(hoy)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Súper')).toBeVisible()

  // el centro evalúa y muestra la alerta
  await page.goto('/notificaciones')
  await expect(page.getByText('Cerca del límite de presupuesto')).toBeVisible()
  await expect(page.getByText(/Llevas el 86% de tu presupuesto de/)).toBeVisible()
  await expect(page.getByRole('link', { name: /No leídas · 1/ })).toBeVisible()

  // el badge de la campana la refleja
  await page.goto('/')
  await expect(page.getByTestId('bell-badge')).toHaveText('1')

  // volver por la campana y marcar leída → badge desaparece
  await page.getByRole('link', { name: /Notificaciones/ }).click()
  await expect(page).toHaveURL(/\/notificaciones/)
  await page.getByRole('button', { name: /Cerca del límite/ }).click()
  await expect(page.getByTestId('bell-badge')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /No leídas · 0/ })).toBeVisible()
})
```

- [ ] **Step 2: Ejecutarlo y verificar que pasa**

Run: `npx playwright test tests/e2e/notificaciones.spec.ts`
Expected: PASS. (Cold-start conocido: re-ejecutar una vez en caliente antes de tocar nada; `--trace on` solo si falla en caliente. NO debilitar aserciones; si la actualización del badge tras la action requiere esperar la revalidación, usa los auto-reintentos de `expect`, no `waitForTimeout`.)

- [ ] **Step 3: Suite completa**

Run: `npx vitest run --testTimeout=20000`
Expected: toda la suite unit verde.

Run: `npx playwright test`
Expected: los 10 e2e verdes (9 previos + este).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/notificaciones.spec.ts
git commit -m "test: e2e de notificaciones — alerta de presupuesto, campana y marcar leída"
```

---

## Spec coverage (self-review)

- §4 modelo `Notification` + enum + unique `[userId, dedupeKey]` + index → Task 1 (verbatim de la spec).
- §5.1 reglas y claves: WARN/OVER con umbrales exactos y clave mensual (`monthParam`); PAYMENT_DUE ≤3 días con singular/plural y PAYMENT_OVERDUE por instante; CARD_DUE con `nextCardDueDate` (ajuste fin de mes, ≤5 días, `used > 0`) y clave del mes del vencimiento; copys congelados → Task 2. `relativeTimeLabel` → Task 2 (corrección documentada: createdAt es instante → getters locales).
- §5.2 `evaluateAlertsForUser` (carga + `alertCandidates` + createMany skipDuplicates, sin escribir si no hay candidatas), lecturas/mutaciones scoped, actions con `idSchema` y revalidate de `/notificaciones` + `/` → Tasks 3-4. Triggers: dashboard vía `persistAlertCandidates` con datos ya cargados (cero queries extra, refinamiento del spec, documentado), `/notificaciones` vía evaluación autónoma → Task 6.
- §5.3 campana como Link con badge numérico (oculto en 0, `99+`), count desde el layout; página con chips "Todas | No leídas · N" (`?f=noleidas`), botón "Marcar todas" (visible con no-leídas), tarjetas del diseño (tinte por tipo, dot, opacidad, click marca leída, error visible), estados vacíos, fuera de NAV_ITEMS → Tasks 5-6.
- §7 testing D2: umbrales exactos (84/85/100/101; 3/4 días; vencido; tarjeta 5/6 días, used 0, ajuste 31→30), claves estables, `relativeTimeLabel`, idempotencia (2ª llamada sin filas; WARN→OVER sin duplicar), unreadCount/markRead ownership/markAll, componentes RTL, página RTL con reloj fijado, dashboard DB test de trigger, e2e completo del flujo de la campana → Tasks 2-7.
- §8: rama `feature/fase-3-d2`, migración `notifications`, review final de rama antes del merge. Al mergear: **Fase 3 completa**.
- Lecciones previas aplicadas: anclas de test a mediodía local (portabilidad de offsets), fechas de datos con `Date.UTC` de componentes locales de hoy (sin flake de boundary), `{ exact: true }` en selects del e2e, aria-labels, errores visibles en client components.
