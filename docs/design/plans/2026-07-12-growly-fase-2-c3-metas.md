# Growly Fase 2 · C3: Metas · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Metas de ahorro tipo "sobres virtuales": objetivos con emoji/color/fecha, aportes manuales que NO tocan cuentas ni movimientos, página `/metas` (hero, tarjetas con progreso, aportar/ver aportes/editar/archivar) y card "Metas de ahorro" en el dashboard.

**Architecture:** `lib/goals.ts` separa lo puro (`goalProgress`, `goalTotals`, `goalDateLabel`) del acceso a datos (`getGoalsForUser` con include de aportes + CRUD scoped por `userId`). `lib/goal-actions.ts` expone server actions con `auth()` + Zod (ids incluidos) + ownership. La página y el dashboard consumen `getGoalsForUser`; los aportes son un contador aparte, jamás crean `Transaction` ni afectan saldos.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Prisma 6.19.3 + Neon PostgreSQL, Zod 4, shadcn/ui sobre Base UI, Vitest + RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-08-growly-fase-2-design.md` (secciones 4, 7, 9, 10, 11).

**Rama:** `feature/fase-2-c3` desde `master`. Merge a `master` tras el review final de rama (patrón C1/C2).

## Global Constraints

- **Dinero:** siempre centavos `Int`. Nunca Float. Formateo con `formatMoney`/`<Money>` existentes.
- **Sobres virtuales (spec §2):** los aportes NO crean `Transaction`, NO tocan cuentas ni saldos. Retirar = borrar el aporte. Cualquier task que importe `lib/transactions` o `lib/balances` para aportes está mal.
- **Multi-tenant:** todo acceso a datos scoped por `userId` de `auth()`. Jamás un `userId` del cliente. Mutaciones sobre recursos existentes con `updateMany`/`deleteMany` + `where: { id, userId }`. `GoalContribution.userId` existe para scoping directo.
- **Ids y payloads de actions SIEMPRE por Zod** (`idSchema` ya existe en `lib/validators.ts`): patrón C2, no copiar el patrón viejo de C1.
- **Mensajes de validación en español** en todo campo alcanzable desde la UI (lección del review C2: nada de "Too small" en inglés).
- **Fechas:** `targetDate` y `date` de aportes llegan de inputs `type=date` → `z.coerce.date()` → medianoche UTC. Para MOSTRAR esas fechas usar getters **UTC** (`getUTCMonth`/`getUTCFullYear`, o `formatShortDateUTC` de `lib/recurrence`). Para "este mes" de aportes usar getters **locales** (consistente con dashboard/presupuesto; unificación UTC = backlog pre-C4).
- **Tests con fecha:** fijar el reloj con `vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime(...)` en tests de componentes/página que dependan de "hoy" (lección C2). Solo `Date`, no fakear timers (rompe RTL/userEvent).
- **UI en español**, tokens del design system (`bg-card`, `text-muted-foreground`, `bg-forest`, `text-acc`, `text-destructive`, `shadow-[var(--shadow-card)]`, radios `rounded-[11px]`/`rounded-[20px]`/`rounded-[22px]`).
- **Botones de solo-icono llevan `aria-label`** (además de `title` si se quiere tooltip): item de backlog C2 aplicado a lo nuevo.
- **Diálogos:** shadcn sobre **Base UI**, `DialogTrigger` usa la prop `render={<elemento/>}` (NO children), `Dialog` controlado `open`/`onOpenChange`, ids de inputs con `React.useId()`, y al ABRIR se resincroniza el estado local con `initial` (lección C1). Patrón: `components/growly/budget-dialog.tsx`.
- **Next.js 16:** `searchParams`/`params` son `Promise`. Ante dudas de API, leer `node_modules/next/dist/docs/` (ver `AGENTS.md`).
- **Prisma pinned a 6.19.3**, no actualizar dependencias. Import de `prisma` al TOPE del archivo (nit del review C2 en budgets.ts, no repetirlo).
- **`.env` es local y gitignored** (DATABASE_URL de Neon + AUTH_SECRET). NO modificarlo, NO imprimirlo, NO commitearlo.
- **Tests de DB:** patrón `describe.skipIf(!process.env.DATABASE_URL)`, email único por archivo, cleanup en `afterAll` scoped a los usuarios del test. Si un test de DB falla SOLO por timeout (latencia Neon), reintentar con `--testTimeout=20000` y anotarlo.
- **Comandos** (Windows PowerShell): `npx vitest run <archivo>` unit, `npx playwright test <archivo>` e2e, `npx prisma migrate dev --name <nombre>` migraciones.
- Commits frecuentes `feat:`/`test:`/`fix:` en español.

---

### Task 1: Schema Prisma, `Goal` + `GoalContribution` + migración

**Files:**
- Modify: `prisma/schema.prisma`
- Test: `tests/goal-schema.test.ts`

**Interfaces:**
- Consumes: modelo existente `User`.
- Produces: modelos `Goal` (id, userId, name, emoji?, colorHex default "#10B981", targetAmount Int centavos, targetDate?, archived default false, createdAt, updatedAt) y `GoalContribution` (id, goalId, userId, amount Int centavos, date default now, note?). Tasks 3-4 dependen de estos nombres exactos.

- [ ] **Step 1: Escribir el test (falla porque los modelos no existen)**

Crear `tests/goal-schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('schema Goal + GoalContribution', () => {
  it('el cliente expone goal y goalContribution', async () => {
    expect(typeof (await prisma.goal.count())).toBe('number')
    expect(typeof (await prisma.goalContribution.count())).toBe('number')
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run tests/goal-schema.test.ts`
Expected: FAIL, `prisma.goal` es `undefined` (TypeError) o error de tipo.

- [ ] **Step 3: Añadir el schema**

En `prisma/schema.prisma`:

1. Añadir al final del archivo (verbatim de la spec §4):

```prisma
model Goal {
  id           String    @id @default(cuid())
  userId       String
  name         String
  emoji        String? // "✈️", "🛡️"… como el diseño
  colorHex     String    @default("#10B981")
  targetAmount Int // centavos, > 0
  targetDate   DateTime? // null = "sin fecha"
  archived     Boolean   @default(false)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  user          User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  contributions GoalContribution[]

  @@index([userId])
}

model GoalContribution {
  id     String   @id @default(cuid())
  goalId String
  userId String // scoping directo para queries/deletes
  amount Int // centavos, > 0 (retirar = borrar el aporte)
  date   DateTime @default(now())
  note   String?

  goal Goal @relation(fields: [goalId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([goalId])
}
```

2. Relaciones inversas en `model User` (junto a `budgets`):

```prisma
  goals             Goal[]
  goalContributions GoalContribution[]
```

3. Ejecutar `npx prisma format`.

- [ ] **Step 4: Crear la migración y verificar que el test pasa**

Run: `npx prisma migrate dev --name goals`
Expected: migración `*_goals` creada y aplicada; `prisma generate` corre solo.

Run: `npx vitest run tests/goal-schema.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/goal-schema.test.ts
git commit -m "feat: modelos Goal y GoalContribution (sobres virtuales)"
```

---

### Task 2: `lib/goals.ts` puro, `goalProgress` + `goalTotals` + `goalDateLabel`

**Files:**
- Create: `lib/goals.ts`
- Test: `tests/goals.test.ts`

**Interfaces:**
- Consumes: nada (puro).
- Produces (Tasks 6-8 dependen de estos nombres exactos):
  - `goalProgress(goal: { targetAmount: number }, saved: number): { pct: number; barPct: number; completed: boolean }`: `pct` real redondeado (puede superar 100), `barPct` = cap 100, `completed` = `saved >= targetAmount` (con target > 0).
  - `type ContributionLike = { amount: number; date: Date }`
  - `goalTotals(contributions: ContributionLike[], now: Date): { saved: number; savedThisMonth: number }`: mes con getters locales.
  - `goalDateLabel(targetDate: Date | null): string`: `'Meta · dic 2026'` (getters UTC) o `'Meta · sin fecha'`.

- [ ] **Step 1: Escribir los tests**

Crear `tests/goals.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { goalProgress, goalTotals, goalDateLabel } from '@/lib/goals'

describe('goalProgress', () => {
  it('progreso normal: 48%', () => {
    expect(goalProgress({ targetAmount: 500_000 }, 240_000))
      .toEqual({ pct: 48, barPct: 48, completed: false })
  })
  it('exactamente el objetivo: 100% y completada', () => {
    expect(goalProgress({ targetAmount: 500_000 }, 500_000))
      .toEqual({ pct: 100, barPct: 100, completed: true })
  })
  it('sobre-ahorro: pct real > 100, barra capada', () => {
    expect(goalProgress({ targetAmount: 500_000 }, 525_000))
      .toEqual({ pct: 105, barPct: 100, completed: true })
  })
  it('sin aportes: 0%', () => {
    expect(goalProgress({ targetAmount: 500_000 }, 0))
      .toEqual({ pct: 0, barPct: 0, completed: false })
  })
  it('target 0 (defensivo): 0% y no completada', () => {
    expect(goalProgress({ targetAmount: 0 }, 100))
      .toEqual({ pct: 0, barPct: 0, completed: false })
  })
})

describe('goalTotals', () => {
  const now = new Date(2026, 6, 15) // 15 jul 2026
  it('suma total y filtra el mes actual con getters locales', () => {
    const contributions = [
      { amount: 60_000, date: new Date(2026, 6, 10) },
      { amount: 40_000, date: new Date(2026, 6, 1) },
      { amount: 140_000, date: new Date(2026, 5, 20) }, // junio: no cuenta este mes
      { amount: 10_000, date: new Date(2025, 6, 10) },  // julio de OTRO año: no cuenta
    ]
    expect(goalTotals(contributions, now)).toEqual({ saved: 250_000, savedThisMonth: 100_000 })
  })
  it('sin aportes: ceros', () => {
    expect(goalTotals([], now)).toEqual({ saved: 0, savedThisMonth: 0 })
  })
})

describe('goalDateLabel', () => {
  it('con fecha: mes corto UTC + año', () => {
    expect(goalDateLabel(new Date(Date.UTC(2026, 11, 1)))).toBe('Meta · dic 2026')
    expect(goalDateLabel(new Date(Date.UTC(2027, 0, 31)))).toBe('Meta · ene 2027')
  })
  it('sin fecha', () => {
    expect(goalDateLabel(null)).toBe('Meta · sin fecha')
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/goals.test.ts`
Expected: FAIL, `Cannot find module '@/lib/goals'`.

- [ ] **Step 3: Implementar**

Crear `lib/goals.ts`:

```ts
export function goalProgress(
  goal: { targetAmount: number },
  saved: number,
): { pct: number; barPct: number; completed: boolean } {
  const pct = goal.targetAmount > 0 ? Math.round((saved / goal.targetAmount) * 100) : 0
  return {
    pct,
    barPct: Math.min(pct, 100),
    completed: goal.targetAmount > 0 && saved >= goal.targetAmount,
  }
}

export type ContributionLike = { amount: number; date: Date }

// "este mes" con getters locales — misma convención que monthlyTotals/budgetProgress.
export function goalTotals(
  contributions: ContributionLike[],
  now: Date,
): { saved: number; savedThisMonth: number } {
  let saved = 0
  let savedThisMonth = 0
  for (const c of contributions) {
    saved += c.amount
    if (c.date.getFullYear() === now.getFullYear() && c.date.getMonth() === now.getMonth()) {
      savedThisMonth += c.amount
    }
  }
  return { saved, savedThisMonth }
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// targetDate se guarda a medianoche UTC (input type=date) → mostrar con getters UTC
// para no correrse un día/mes en offsets negativos.
export function goalDateLabel(targetDate: Date | null): string {
  if (!targetDate) return 'Meta · sin fecha'
  return `Meta · ${MESES_CORTOS[targetDate.getUTCMonth()]} ${targetDate.getUTCFullYear()}`
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/goals.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/goals.ts tests/goals.test.ts
git commit -m "feat: goalProgress, goalTotals y goalDateLabel puros"
```

---

### Task 3: `lib/goals.ts` DB, `getGoalsForUser` + CRUD + aportes

**Files:**
- Modify: `lib/goals.ts` (import de prisma al TOPE del archivo; funciones DB al final, lo puro de Task 2 no se toca)
- Test: `tests/goals-db.test.ts`

**Interfaces:**
- Consumes: `prisma`, modelos Task 1, `goalTotals` (Task 2).
- Produces (Tasks 4 y 7-8 dependen de estas firmas):
  - `getGoalsForUser(userId: string, now?: Date)` → metas NO archivadas, orden `createdAt` asc, cada una con `contributions` (orden `date` desc) y `saved`/`savedThisMonth` calculados con `goalTotals`.
  - `type GoalData = { name: string; emoji?: string | null; colorHex: string; targetAmount: number; targetDate?: Date | null }`
  - `createGoalForUser(userId, data: GoalData)`
  - `updateGoalForUser(userId, id, data: GoalData): Promise<{ ok: boolean }>` (updateMany; `emoji`/`targetDate` undefined → null para poder limpiarlos)
  - `archiveGoalForUser(userId, id): Promise<{ ok: boolean }>`
  - `addContributionForUser(userId, { goalId, amount, date?, note? }): Promise<{ ok: boolean }>`: verifica que la meta es del usuario ANTES de crear.
  - `deleteContributionForUser(userId, id): Promise<{ ok: boolean }>`

Nota de diseño (desviación deliberada del hint `_sum` de la spec §7.1): la página necesita la lista de aportes de cada meta para "ver aportes", así que `getGoalsForUser` hace UNA query con `include` y suma en JS vía `goalTotals` (puro, ya testeado) en lugar de dos `groupBy` extra. Mismo resultado, menos round-trips a Neon.

- [ ] **Step 1: Escribir los tests**

Crear `tests/goals-db.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  getGoalsForUser, createGoalForUser, updateGoalForUser, archiveGoalForUser,
  addContributionForUser, deleteContributionForUser,
} from '@/lib/goals'

const email = `goal_${Date.now()}@growly.app`
let userId = ''
let otherId = ''
let goalA = ''
let goalB = ''

const now = new Date(2026, 6, 15) // "hoy" fijo: 15 jul 2026

describe.skipIf(!process.env.DATABASE_URL)('goals DB', () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { name: 'Goal', email } })).id
    otherId = (await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })).id
  })
  afterAll(async () => {
    await prisma.goalContribution.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.goal.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('createGoalForUser crea; getGoalsForUser ordena por createdAt asc', async () => {
    goalA = (await createGoalForUser(userId, {
      name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6', targetAmount: 500_000,
      targetDate: new Date(Date.UTC(2026, 11, 1)),
    })).id
    goalB = (await createGoalForUser(userId, {
      name: 'Fondo', emoji: '🛡️', colorHex: '#10B981', targetAmount: 1_000_000, targetDate: null,
    })).id
    const goals = await getGoalsForUser(userId, now)
    expect(goals.map((g) => g.name)).toEqual(['Viaje', 'Fondo'])
    expect(goals[0]).toMatchObject({ saved: 0, savedThisMonth: 0 })
  })

  it('aportes: saved/savedThisMonth correctos y contributions en orden date desc', async () => {
    await addContributionForUser(userId, { goalId: goalA, amount: 140_000, date: new Date(2026, 5, 20) })
    await addContributionForUser(userId, { goalId: goalA, amount: 60_000, date: new Date(2026, 6, 10), note: 'extra' })
    await addContributionForUser(userId, { goalId: goalA, amount: 40_000, date: new Date(2026, 6, 1) })
    const goals = await getGoalsForUser(userId, now)
    const viaje = goals.find((g) => g.id === goalA)!
    expect(viaje.saved).toBe(240_000)
    expect(viaje.savedThisMonth).toBe(100_000)
    expect(viaje.contributions.map((c) => c.amount)).toEqual([60_000, 40_000, 140_000])
    expect(viaje.contributions[0].note).toBe('extra')
  })

  it('addContributionForUser rechaza meta ajena sin crear nada', async () => {
    const res = await addContributionForUser(otherId, { goalId: goalA, amount: 10_000 })
    expect(res).toEqual({ ok: false })
    expect(await prisma.goalContribution.count({ where: { goalId: goalA } })).toBe(3)
  })

  it('updateGoalForUser respeta ownership y limpia campos opcionales', async () => {
    expect(await updateGoalForUser(otherId, goalA, {
      name: 'Hack', colorHex: '#000000', targetAmount: 1,
    })).toEqual({ ok: false })
    expect(await updateGoalForUser(userId, goalA, {
      name: 'Viaje a Japón', colorHex: '#3B82F6', targetAmount: 600_000,
    })).toEqual({ ok: true })
    const updated = await prisma.goal.findUnique({ where: { id: goalA } })
    expect(updated).toMatchObject({ name: 'Viaje a Japón', targetAmount: 600_000, emoji: null, targetDate: null })
  })

  it('deleteContributionForUser respeta ownership', async () => {
    const c = await prisma.goalContribution.findFirst({ where: { goalId: goalA, amount: 40_000 } })
    expect(await deleteContributionForUser(otherId, c!.id)).toEqual({ ok: false })
    expect(await deleteContributionForUser(userId, c!.id)).toEqual({ ok: true })
    expect((await getGoalsForUser(userId, now)).find((g) => g.id === goalA)!.saved).toBe(200_000)
  })

  it('archiveGoalForUser oculta la meta de getGoalsForUser', async () => {
    expect(await archiveGoalForUser(otherId, goalB)).toEqual({ ok: false })
    expect(await archiveGoalForUser(userId, goalB)).toEqual({ ok: true })
    const goals = await getGoalsForUser(userId, now)
    expect(goals.map((g) => g.id)).toEqual([goalA])
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/goals-db.test.ts`
Expected: FAIL, los exports DB no existen.

- [ ] **Step 3: Implementar**

En `lib/goals.ts`: añadir en la PRIMERA línea del archivo:

```ts
import { prisma } from '@/lib/prisma'
```

y al FINAL del archivo:

```ts
export async function getGoalsForUser(userId: string, now: Date = new Date()) {
  const goals = await prisma.goal.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: 'asc' },
    include: { contributions: { orderBy: { date: 'desc' } } },
  })
  return goals.map((g) => ({ ...g, ...goalTotals(g.contributions, now) }))
}

export type GoalData = {
  name: string
  emoji?: string | null
  colorHex: string
  targetAmount: number
  targetDate?: Date | null
}

export function createGoalForUser(userId: string, data: GoalData) {
  return prisma.goal.create({ data: { ...data, userId } })
}

export async function updateGoalForUser(userId: string, id: string, data: GoalData) {
  const res = await prisma.goal.updateMany({
    where: { id, userId },
    data: { ...data, emoji: data.emoji ?? null, targetDate: data.targetDate ?? null },
  })
  return { ok: res.count > 0 }
}

export async function archiveGoalForUser(userId: string, id: string) {
  const res = await prisma.goal.updateMany({ where: { id, userId }, data: { archived: true } })
  return { ok: res.count > 0 }
}

// Sobres virtuales: el aporte es un contador aparte — jamás crea Transaction ni toca saldos.
export async function addContributionForUser(
  userId: string,
  data: { goalId: string; amount: number; date?: Date; note?: string | null },
) {
  const goal = await prisma.goal.findFirst({
    where: { id: data.goalId, userId },
    select: { id: true },
  })
  if (!goal) return { ok: false }
  await prisma.goalContribution.create({
    data: {
      goalId: data.goalId,
      userId,
      amount: data.amount,
      ...(data.date ? { date: data.date } : {}),
      note: data.note ?? null,
    },
  })
  return { ok: true }
}

export async function deleteContributionForUser(userId: string, id: string) {
  const res = await prisma.goalContribution.deleteMany({ where: { id, userId } })
  return { ok: res.count > 0 }
}
```

- [ ] **Step 4: Verificar que pasan (y lo puro sigue verde)**

Run: `npx vitest run tests/goals-db.test.ts tests/goals.test.ts`
Expected: PASS (6 + 9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/goals.ts tests/goals-db.test.ts
git commit -m "feat: getGoalsForUser con aportes incluidos + CRUD de metas y aportes"
```

---

### Task 4: `goalSchema`/`contributionSchema` + `lib/goal-actions.ts`

**Files:**
- Modify: `lib/validators.ts` (añadir al final)
- Create: `lib/goal-actions.ts`
- Test: `tests/goal-actions.test.ts`

**Interfaces:**
- Consumes: funciones DB de Task 3, `idSchema` existente en `lib/validators.ts`, `auth` de `@/lib/auth`.
- Produces (Tasks 5-6 dependen de estas firmas; todas retornan `{ ok: true } | { ok: false, error: string }`):
  - `goalSchema`, `contributionSchema` en `lib/validators.ts`.
  - `createGoal(values: unknown)`, `updateGoal(id: unknown, values: unknown)`, `archiveGoal(id: unknown)`, `addContribution(values: unknown)`, `deleteContribution(id: unknown)` en `lib/goal-actions.ts`.

- [ ] **Step 1: Escribir los tests**

Crear `tests/goal-actions.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const email = `goalact_${Date.now()}@growly.app`
let userId = ''
let otherId = ''
let foreignGoalId = ''

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  createGoal, updateGoal, archiveGoal, addContribution, deleteContribution,
} from '@/lib/goal-actions'

describe.skipIf(!process.env.DATABASE_URL)('goal actions', () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { name: 'GoalAct', email } })).id
    otherId = (await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })).id
    foreignGoalId = (await prisma.goal.create({
      data: { userId: otherId, name: 'Ajena', targetAmount: 100_000 },
    })).id
  })
  afterAll(async () => {
    await prisma.goalContribution.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.goal.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('createGoal crea una meta', async () => {
    const res = await createGoal({
      name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6', targetAmount: 500_000, targetDate: null,
    })
    expect(res.ok).toBe(true)
    expect(await prisma.goal.count({ where: { userId } })).toBe(1)
  })

  it('rechaza targetAmount 0 y colorHex inválido con mensaje en español', async () => {
    const r1 = await createGoal({ name: 'X', colorHex: '#3B82F6', targetAmount: 0 })
    expect(r1).toEqual({ ok: false, error: 'El objetivo debe ser mayor que 0' })
    const r2 = await createGoal({ name: 'X', colorHex: 'azul', targetAmount: 100 })
    expect(r2).toEqual({ ok: false, error: 'Color no válido' })
  })

  it('updateGoal de meta ajena → Meta no encontrada; id no-string → Datos inválidos', async () => {
    const res = await updateGoal(foreignGoalId, {
      name: 'Hack', colorHex: '#000000', targetAmount: 1,
    })
    expect(res).toEqual({ ok: false, error: 'Meta no encontrada' })
    expect(await updateGoal(123, { name: 'X', colorHex: '#000000', targetAmount: 1 }))
      .toEqual({ ok: false, error: 'Datos inválidos' })
  })

  it('addContribution a meta propia ok; a meta ajena → Meta no encontrada', async () => {
    const goal = await prisma.goal.findFirst({ where: { userId } })
    expect((await addContribution({ goalId: goal!.id, amount: 240_000, date: '2026-07-10' })).ok).toBe(true)
    const res = await addContribution({ goalId: foreignGoalId, amount: 10_000 })
    expect(res).toEqual({ ok: false, error: 'Meta no encontrada' })
  })

  it('deleteContribution valida id y ownership', async () => {
    expect(await deleteContribution(123)).toEqual({ ok: false, error: 'Datos inválidos' })
    const c = await prisma.goalContribution.findFirst({ where: { userId } })
    const foreign = await prisma.goalContribution.create({
      data: { goalId: foreignGoalId, userId: otherId, amount: 1_000 },
    })
    expect((await deleteContribution(foreign.id)).ok).toBe(false)
    expect((await deleteContribution(c!.id)).ok).toBe(true)
  })

  it('archiveGoal archiva la propia', async () => {
    const goal = await prisma.goal.findFirst({ where: { userId } })
    expect((await archiveGoal(goal!.id)).ok).toBe(true)
    expect((await prisma.goal.findUnique({ where: { id: goal!.id } }))!.archived).toBe(true)
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/goal-actions.test.ts`
Expected: FAIL, `Cannot find module '@/lib/goal-actions'`.

- [ ] **Step 3: Implementar**

1. Añadir al FINAL de `lib/validators.ts`:

```ts
export const goalSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  emoji: z.string().trim().max(8, 'Emoji demasiado largo').nullable().optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color no válido'),
  targetAmount: z.number().int().positive('El objetivo debe ser mayor que 0'),
  targetDate: z.coerce.date().nullable().optional(),
})

export type GoalFormValues = z.infer<typeof goalSchema>

export const contributionSchema = z.object({
  goalId: z.string().min(1, 'Meta requerida'),
  amount: z.number().int().positive('El importe debe ser mayor que 0'),
  date: z.coerce.date().optional(),
  note: z.string().trim().max(200, 'Nota demasiado larga').optional(),
})

export type ContributionFormValues = z.infer<typeof contributionSchema>
```

2. Crear `lib/goal-actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { goalSchema, contributionSchema, idSchema } from '@/lib/validators'
import {
  createGoalForUser, updateGoalForUser, archiveGoalForUser,
  addContributionForUser, deleteContributionForUser,
} from '@/lib/goals'

function revalidate() {
  revalidatePath('/metas')
  revalidatePath('/')
}

export async function createGoal(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsed = goalSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  try {
    await createGoalForUser(session.user.id, parsed.data)
  } catch {
    return { ok: false as const, error: 'No se pudo crear la meta' }
  }
  revalidate()
  return { ok: true as const }
}

export async function updateGoal(id: unknown, values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false as const, error: 'Datos inválidos' }
  const parsed = goalSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  try {
    const res = await updateGoalForUser(session.user.id, parsedId.data, parsed.data)
    if (!res.ok) return { ok: false as const, error: 'Meta no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo actualizar la meta' }
  }
  revalidate()
  return { ok: true as const }
}

export async function archiveGoal(id: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false as const, error: 'Datos inválidos' }
  try {
    const res = await archiveGoalForUser(session.user.id, parsedId.data)
    if (!res.ok) return { ok: false as const, error: 'Meta no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo archivar la meta' }
  }
  revalidate()
  return { ok: true as const }
}

export async function addContribution(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsed = contributionSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  try {
    const res = await addContributionForUser(session.user.id, parsed.data)
    if (!res.ok) return { ok: false as const, error: 'Meta no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo guardar el aporte' }
  }
  revalidate()
  return { ok: true as const }
}

export async function deleteContribution(id: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false as const, error: 'Datos inválidos' }
  try {
    const res = await deleteContributionForUser(session.user.id, parsedId.data)
    if (!res.ok) return { ok: false as const, error: 'Aporte no encontrado' }
  } catch {
    return { ok: false as const, error: 'No se pudo borrar el aporte' }
  }
  revalidate()
  return { ok: true as const }
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/goal-actions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/validators.ts lib/goal-actions.ts tests/goal-actions.test.ts
git commit -m "feat: goalSchema/contributionSchema + actions de metas y aportes con zod en ids"
```

---

### Task 5: Diálogos, `GoalDialog`, `ContributionDialog`, `ContributionsListDialog`

**Files:**
- Create: `components/growly/goal-dialog.tsx`
- Create: `components/growly/contribution-dialog.tsx`
- Create: `components/growly/contributions-list-dialog.tsx`
- Test: `tests/goal-dialogs.test.tsx`

**Interfaces:**
- Consumes: actions de Task 4, `parseAmountToCents`, `Dialog`/`Button`/`Input`/`Label` de `components/ui`, `<Money>`.
- Produces (Tasks 6-7 dependen de estas props exactas):
  - `GoalDialog({ goalId?: string; initial?: GoalFormInitial; trigger?: React.ReactElement })` con `type GoalFormInitial = { name: string; emoji: string; colorHex: string; targetAmountStr: string; targetDate: string }`: sin `goalId` = crear (trigger default: tarjeta punteada "Nueva meta"); con `goalId` = editar.
  - `ContributionDialog({ goalId: string; goalName: string; trigger?: React.ReactElement })`: trigger default: botón "+ Aportar".
  - `ContributionsListDialog({ goalName: string; contributions: ContributionView[]; trigger: React.ReactElement })` con `type ContributionView = { id: string; amount: number; dateLabel: string; note: string | null }`.

- [ ] **Step 1: Escribir los tests**

Crear `tests/goal-dialogs.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GoalDialog } from '@/components/growly/goal-dialog'
import { ContributionDialog } from '@/components/growly/contribution-dialog'
import { ContributionsListDialog } from '@/components/growly/contributions-list-dialog'
import { createGoal, updateGoal, addContribution, deleteContribution } from '@/lib/goal-actions'

vi.mock('@/lib/goal-actions', () => ({
  createGoal: vi.fn(async () => ({ ok: true })),
  updateGoal: vi.fn(async () => ({ ok: true })),
  addContribution: vi.fn(async () => ({ ok: true })),
  deleteContribution: vi.fn(async () => ({ ok: true })),
}))

// Reloj fijado: la fecha default del aporte ("hoy") debe ser determinista.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 15))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(() => vi.clearAllMocks())

describe('GoalDialog · crear', () => {
  it('nombre + emoji sugerido + color + objetivo en centavos + sin fecha', async () => {
    const user = userEvent.setup()
    render(<GoalDialog />)
    await user.click(screen.getByRole('button', { name: /Nueva meta/i }))
    await user.type(screen.getByLabelText('Nombre'), 'Viaje a Japón')
    await user.click(screen.getByRole('button', { name: '✈️' }))
    await user.click(screen.getByRole('button', { name: 'Color #3B82F6' }))
    await user.type(screen.getByLabelText('Importe objetivo'), '5000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(createGoal).toHaveBeenCalledWith({
        name: 'Viaje a Japón', emoji: '✈️', colorHex: '#3B82F6',
        targetAmount: 500_000, targetDate: null,
      }),
    )
  })

  it('rechaza objetivo inválido sin llamar a la action', async () => {
    const user = userEvent.setup()
    render(<GoalDialog />)
    await user.click(screen.getByRole('button', { name: /Nueva meta/i }))
    await user.type(screen.getByLabelText('Nombre'), 'X')
    await user.type(screen.getByLabelText('Importe objetivo'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Importe no válido')).toBeInTheDocument()
    expect(createGoal).not.toHaveBeenCalled()
  })
})

describe('GoalDialog · editar', () => {
  const initial = {
    name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6',
    targetAmountStr: '5000.00', targetDate: '2026-12-01',
  }
  it('precarga y llama updateGoal con el id', async () => {
    const user = userEvent.setup()
    render(<GoalDialog goalId="g1" initial={initial} trigger={<button type="button">Editar</button>} />)
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Viaje')
    expect(screen.getByLabelText('Importe objetivo')).toHaveValue('5000.00')
    expect(screen.getByLabelText('Fecha objetivo')).toHaveValue('2026-12-01')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(updateGoal).toHaveBeenCalledWith('g1', {
        name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6',
        targetAmount: 500_000, targetDate: '2026-12-01',
      }),
    )
  })
})

describe('ContributionDialog', () => {
  it('aporta con fecha default hoy y nota opcional omitida', async () => {
    const user = userEvent.setup()
    render(<ContributionDialog goalId="g1" goalName="Viaje" />)
    await user.click(screen.getByRole('button', { name: /Aportar/i }))
    expect(screen.getByText(/Aportar a Viaje/)).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-07-15')
    await user.type(screen.getByLabelText('Importe'), '2400')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(addContribution).toHaveBeenCalledWith({
        goalId: 'g1', amount: 240_000, date: '2026-07-15', note: undefined,
      }),
    )
  })

  it('muestra el error de la action', async () => {
    vi.mocked(addContribution).mockResolvedValueOnce({ ok: false, error: 'Meta no encontrada' })
    const user = userEvent.setup()
    render(<ContributionDialog goalId="g1" goalName="Viaje" />)
    await user.click(screen.getByRole('button', { name: /Aportar/i }))
    await user.type(screen.getByLabelText('Importe'), '10')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Meta no encontrada')).toBeInTheDocument()
  })
})

describe('ContributionsListDialog', () => {
  const contributions = [
    { id: 'c1', amount: 60_000, dateLabel: '10 jul', note: 'extra' },
    { id: 'c2', amount: 140_000, dateLabel: '20 jun', note: null },
  ]
  it('lista aportes y borra con deleteContribution', async () => {
    const user = userEvent.setup()
    render(
      <ContributionsListDialog goalName="Viaje" contributions={contributions}
        trigger={<button type="button">Ver aportes</button>} />,
    )
    await user.click(screen.getByRole('button', { name: 'Ver aportes' }))
    expect(screen.getByText('10 jul · extra')).toBeInTheDocument()
    expect(screen.getByText('20 jun')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Borrar aporte' })[0])
    await waitFor(() => expect(deleteContribution).toHaveBeenCalledWith('c1'))
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/goal-dialogs.test.tsx`
Expected: FAIL, módulos de componentes inexistentes.

- [ ] **Step 3: Implementar los tres diálogos**

Crear `components/growly/goal-dialog.tsx`:

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
import { createGoal, updateGoal } from '@/lib/goal-actions'
import { parseAmountToCents } from '@/lib/money'

const EMOJIS = ['✈️', '🛡️', '💻', '🏠', '🚗', '🎁', '💍', '🎓']
const PALETTE = ['#10B981', '#3B82F6', '#8B7CF6', '#E0AD2E', '#C9584F', '#8A857E']

export type GoalFormInitial = {
  name: string
  emoji: string // '' = sin emoji
  colorHex: string
  targetAmountStr: string
  targetDate: string // 'YYYY-MM-DD' o ''
}

export function GoalDialog({
  goalId, initial, trigger,
}: {
  goalId?: string
  initial?: GoalFormInitial
  trigger?: React.ReactElement
}) {
  const uid = React.useId()
  const [open, setOpen] = useState(false)
  const [emoji, setEmoji] = useState(initial?.emoji ?? '')
  const [colorHex, setColorHex] = useState(initial?.colorHex ?? PALETTE[0])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const editing = !!goalId

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData(e.currentTarget)
    const targetAmount = parseAmountToCents(String(fd.get('targetAmount') ?? ''))
    if (!targetAmount) {
      setError('Importe no válido')
      setLoading(false)
      return
    }
    const payload = {
      name: String(fd.get('name') ?? ''),
      emoji: emoji || null,
      colorHex,
      targetAmount,
      targetDate: String(fd.get('targetDate') ?? '') || null,
    }
    const res = editing ? await updateGoal(goalId, payload) : await createGoal(payload)
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
        if (o) {
          // resincronizar al abrir (lección C1): el initial puede haber cambiado tras un revalidate
          setEmoji(initial?.emoji ?? '')
          setColorHex(initial?.colorHex ?? PALETTE[0])
        }
        if (!o) setError(null)
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <button
              type="button"
              className="flex min-h-[120px] w-full items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-border bg-card/50 text-sm font-bold text-muted-foreground hover:bg-muted"
            >
              <Plus size={16} /> Nueva meta
            </button>
          )
        }
      />
      <DialogContent className="w-full max-w-[440px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">
          {editing ? `Editar meta · ${initial?.name ?? ''}` : 'Nueva meta'}
        </DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor={`${uid}-name`}>Nombre</Label>
            <Input id={`${uid}-name`} name="name" defaultValue={initial?.name} required />
          </div>
          <div>
            <Label htmlFor={`${uid}-emoji`}>Emoji</Label>
            <Input
              id={`${uid}-emoji`}
              name="emoji"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="✈️"
              className="w-24"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  aria-pressed={emoji === em}
                  onClick={() => setEmoji(em)}
                  className={`flex h-9 w-9 items-center justify-center rounded-[9px] border text-lg ${
                    emoji === em ? 'border-acc bg-acc/10' : 'border-border bg-card hover:bg-muted'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Color</Label>
            <div className="mt-1 flex gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={colorHex === c}
                  onClick={() => setColorHex(c)}
                  className={`h-8 w-8 rounded-full border-2 ${
                    colorHex === c ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor={`${uid}-targetAmount`}>Importe objetivo</Label>
            <Input
              id={`${uid}-targetAmount`}
              name="targetAmount"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={initial?.targetAmountStr}
              required
            />
          </div>
          <div>
            <Label htmlFor={`${uid}-targetDate`}>Fecha objetivo</Label>
            <Input
              id={`${uid}-targetDate`}
              name="targetDate"
              type="date"
              defaultValue={initial?.targetDate}
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

Crear `components/growly/contribution-dialog.tsx`:

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
import { addContribution } from '@/lib/goal-actions'
import { parseAmountToCents } from '@/lib/money'

// fecha local de hoy en formato del input date
function todayStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function ContributionDialog({
  goalId, goalName, trigger,
}: {
  goalId: string
  goalName: string
  trigger?: React.ReactElement
}) {
  const uid = React.useId()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
    const res = await addContribution({
      goalId,
      amount,
      date: String(fd.get('date') ?? '') || undefined,
      note: String(fd.get('note') ?? '').trim() || undefined,
    })
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
            <Button className="h-8 px-3 text-xs font-extrabold">
              <Plus size={14} /> Aportar
            </Button>
          )
        }
      />
      <DialogContent className="w-full max-w-[400px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">Aportar a {goalName}</DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor={`${uid}-amount`}>Importe</Label>
            <Input id={`${uid}-amount`} name="amount" inputMode="decimal" placeholder="0.00" required />
          </div>
          <div>
            <Label htmlFor={`${uid}-date`}>Fecha</Label>
            <Input id={`${uid}-date`} name="date" type="date" defaultValue={todayStr()} required />
          </div>
          <div>
            <Label htmlFor={`${uid}-note`}>Nota (opcional)</Label>
            <Input id={`${uid}-note`} name="note" />
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

Crear `components/growly/contributions-list-dialog.tsx`:

```tsx
'use client'

import * as React from 'react'
import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Money } from '@/components/growly/money'
import { deleteContribution } from '@/lib/goal-actions'

export type ContributionView = {
  id: string
  amount: number
  dateLabel: string // p. ej. "10 jul" (formatShortDateUTC, lo calcula la página)
  note: string | null
}

export function ContributionsListDialog({
  goalName, contributions, trigger,
}: {
  goalName: string
  contributions: ContributionView[]
  trigger: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setError(null)
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="w-full max-w-[400px] rounded-[22px] bg-card p-6">
        <DialogTitle className="mb-4 text-xl font-extrabold">Aportes · {goalName}</DialogTitle>
        {contributions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin aportes todavía.</p>
        ) : (
          <div className="flex max-h-[320px] flex-col divide-y divide-[var(--line)] overflow-y-auto">
            {contributions.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-3">
                <span className="flex-1 text-sm text-muted-foreground">
                  {c.note ? `${c.dateLabel} · ${c.note}` : c.dateLabel}
                </span>
                <Money cents={c.amount} className="text-sm font-extrabold" />
                <button
                  type="button"
                  aria-label="Borrar aporte"
                  title="Borrar aporte"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const res = await deleteContribution(c.id)
                      setError(res.ok ? null : res.error)
                    })
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/goal-dialogs.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add components/growly/goal-dialog.tsx components/growly/contribution-dialog.tsx components/growly/contributions-list-dialog.tsx tests/goal-dialogs.test.tsx
git commit -m "feat: diálogos de meta, aporte y lista de aportes"
```

---

### Task 6: `GoalsHero` + `GoalCard`

**Files:**
- Create: `components/growly/goals-hero.tsx`
- Create: `components/growly/goal-card.tsx`
- Test: `tests/goal-components.test.tsx`

**Interfaces:**
- Consumes: diálogos de Task 5, `<Money>`, `archiveGoal` de Task 4.
- Produces (Task 7 depende de estas props exactas):
  - `GoalsHero({ totalSaved: number; activeCount: number; savedThisMonth: number })`
  - `GoalCard({ goal: GoalView })` con `type GoalView = { id: string; name: string; emoji: string | null; colorHex: string; targetAmount: number; saved: number; pct: number; barPct: number; completed: boolean; dateLabel: string; initial: GoalFormInitial; contributions: ContributionView[] }`

- [ ] **Step 1: Escribir los tests**

Crear `tests/goal-components.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GoalsHero } from '@/components/growly/goals-hero'
import { GoalCard } from '@/components/growly/goal-card'

vi.mock('@/lib/goal-actions', () => ({
  createGoal: vi.fn(), updateGoal: vi.fn(), archiveGoal: vi.fn(),
  addContribution: vi.fn(), deleteContribution: vi.fn(),
}))

describe('GoalsHero', () => {
  it('muestra total, plural y ahorro del mes', () => {
    render(<GoalsHero totalSaved={1_130_000} activeCount={3} savedThisMonth={62_000} />)
    expect(screen.getByText('Total ahorrado en metas')).toBeInTheDocument()
    expect(screen.getByText('$11,300')).toBeInTheDocument()
    expect(screen.getByText(/3 metas activas/)).toBeInTheDocument()
  })
  it('singular con una meta', () => {
    render(<GoalsHero totalSaved={0} activeCount={1} savedThisMonth={0} />)
    expect(screen.getByText(/1 meta activa ·/)).toBeInTheDocument()
  })
})

const baseGoal = {
  id: 'g1', name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6',
  targetAmount: 500_000, saved: 240_000, pct: 48, barPct: 48, completed: false,
  dateLabel: 'Meta · dic 2026',
  initial: { name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6', targetAmountStr: '5000.00', targetDate: '2026-12-01' },
  contributions: [],
}

describe('GoalCard', () => {
  it('muestra nombre, subtítulo, ahorrado/objetivo, % y barra con el color', () => {
    render(<GoalCard goal={baseGoal} />)
    expect(screen.getByText('Viaje')).toBeInTheDocument()
    expect(screen.getByText('Meta · dic 2026')).toBeInTheDocument()
    expect(screen.getByText('$2,400')).toBeInTheDocument()
    expect(screen.getByText('48% completado')).toBeInTheDocument()
    expect(screen.getByTestId('goal-bar')).toHaveStyle({ width: '48%', backgroundColor: '#3B82F6' })
    expect(screen.queryByText('¡Completada!')).not.toBeInTheDocument()
  })
  it('completada: badge y barra verde capada al 100%', () => {
    render(
      <GoalCard goal={{ ...baseGoal, saved: 525_000, pct: 105, barPct: 100, completed: true }} />,
    )
    expect(screen.getByText('¡Completada!')).toBeInTheDocument()
    expect(screen.getByText('105% completado')).toBeInTheDocument()
    expect(screen.getByTestId('goal-bar')).toHaveStyle({ width: '100%', backgroundColor: '#10B981' })
  })
  it('acciones accesibles: aportar, ver aportes, editar y archivar', () => {
    render(<GoalCard goal={baseGoal} />)
    expect(screen.getByRole('button', { name: /Aportar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver aportes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archivar' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/goal-components.test.tsx`
Expected: FAIL, módulos inexistentes.

- [ ] **Step 3: Implementar**

Crear `components/growly/goals-hero.tsx`:

```tsx
import { Money } from '@/components/growly/money'

export function GoalsHero({
  totalSaved, activeCount, savedThisMonth,
}: {
  totalSaved: number
  activeCount: number
  savedThisMonth: number
}) {
  return (
    <div className="relative overflow-hidden rounded-[22px] bg-forest p-6 text-white shadow-[0_18px_40px_-18px_rgba(18,33,28,.5)]">
      <div className="absolute -right-10 -top-12 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,.4),transparent_70%)]" />
      <div className="mb-2 text-sm text-white/60">Total ahorrado en metas</div>
      <Money cents={totalSaved} withCents={false} className="text-[42px] font-extrabold tracking-[-0.03em]" />
      <div className="mt-3 text-sm text-white/70">
        {activeCount} {activeCount === 1 ? 'meta activa' : 'metas activas'} ·{' '}
        <b className="text-white">
          +<Money cents={savedThisMonth} withCents={false} />
        </b>{' '}
        este mes
      </div>
    </div>
  )
}
```

Crear `components/growly/goal-card.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Archive, List, Pencil } from 'lucide-react'
import { Money } from '@/components/growly/money'
import { GoalDialog, type GoalFormInitial } from '@/components/growly/goal-dialog'
import { ContributionDialog } from '@/components/growly/contribution-dialog'
import {
  ContributionsListDialog,
  type ContributionView,
} from '@/components/growly/contributions-list-dialog'
import { archiveGoal } from '@/lib/goal-actions'

export type GoalView = {
  id: string
  name: string
  emoji: string | null
  colorHex: string
  targetAmount: number
  saved: number
  pct: number
  barPct: number
  completed: boolean
  dateLabel: string
  initial: GoalFormInitial
  contributions: ContributionView[]
}

const COMPLETED_GREEN = '#10B981'

const iconBtnCls =
  'flex h-8 w-8 items-center justify-center rounded-[9px] border border-border bg-card text-muted-foreground hover:bg-muted disabled:opacity-50'

export function GoalCard({ goal }: { goal: GoalView }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="rounded-[22px] border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        {/* tile 42px con el emoji sobre el color de la meta al ~13% (alfa hex 21) */}
        <div
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-xl"
          style={{ backgroundColor: `${goal.colorHex}21` }}
          aria-hidden
        >
          {goal.emoji ?? '🎯'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-foreground">{goal.name}</span>
            {goal.completed && (
              <span className="rounded-full bg-acc/15 px-2 py-0.5 text-[11px] font-bold text-acc">
                ¡Completada!
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{goal.dateLabel}</div>
        </div>
        <div className="text-right">
          <Money cents={goal.saved} withCents={false} className="text-xl font-extrabold text-foreground" />
          <div className="text-xs text-muted-foreground">
            de <Money cents={goal.targetAmount} withCents={false} />
          </div>
        </div>
      </div>

      <div className="mt-3 h-2 rounded-full bg-muted">
        <div
          data-testid="goal-bar"
          className="h-2 rounded-full"
          style={{
            width: `${goal.barPct}%`,
            backgroundColor: goal.completed ? COMPLETED_GREEN : goal.colorHex,
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">{goal.pct}% completado</span>
        <div className="flex items-center gap-1.5">
          <ContributionDialog goalId={goal.id} goalName={goal.name} />
          <ContributionsListDialog
            goalName={goal.name}
            contributions={goal.contributions}
            trigger={
              <button type="button" aria-label="Ver aportes" title="Ver aportes" className={iconBtnCls}>
                <List size={15} />
              </button>
            }
          />
          <GoalDialog
            goalId={goal.id}
            initial={goal.initial}
            trigger={
              <button type="button" aria-label="Editar" title="Editar" className={iconBtnCls}>
                <Pencil size={15} />
              </button>
            }
          />
          <button
            type="button"
            aria-label="Archivar"
            title="Archivar"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await archiveGoal(goal.id)
                setError(res.ok ? null : res.error)
              })
            }
            className={iconBtnCls}
          >
            <Archive size={15} />
          </button>
        </div>
      </div>
      {error && <div className="mt-1 text-[11px] font-bold text-destructive">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npx vitest run tests/goal-components.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add components/growly/goals-hero.tsx components/growly/goal-card.tsx tests/goal-components.test.tsx
git commit -m "feat: GoalsHero y GoalCard con progreso, completada y acciones"
```

---

### Task 7: Página `/metas`

**Files:**
- Modify: `app/(app)/metas/page.tsx` (hoy es un placeholder `ComingSoon`, se reemplaza entero)
- Test: `tests/metas-page.test.tsx`

**Interfaces:**
- Consumes: `getGoalsForUser`/`goalProgress`/`goalDateLabel` (Tasks 2-3), `formatShortDateUTC` de `lib/recurrence` (existente), componentes de Tasks 5-6.
- Produces: página server component en `/metas`.

- [ ] **Step 1: Escribir los tests**

Crear `tests/metas-page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/goal-actions', () => ({
  createGoal: vi.fn(), updateGoal: vi.fn(), archiveGoal: vi.fn(),
  addContribution: vi.fn(), deleteContribution: vi.fn(),
}))

const getGoalsForUser = vi.fn()
vi.mock('@/lib/goals', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/goals')>()
  return { ...real, getGoalsForUser: (...a: unknown[]) => getGoalsForUser(...a) }
})

import MetasPage from '@/app/(app)/metas/page'

// reloj fijado para que los totales "este mes" sean deterministas
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 15))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(() => getGoalsForUser.mockReset())

const goal = {
  id: 'g1', userId: 'u1', name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6',
  targetAmount: 500_000, targetDate: new Date(Date.UTC(2026, 11, 1)),
  archived: false, createdAt: new Date(2026, 5, 1), updatedAt: new Date(2026, 5, 1),
  contributions: [
    { id: 'c1', goalId: 'g1', userId: 'u1', amount: 240_000, date: new Date(2026, 6, 10), note: null },
  ],
  saved: 240_000, savedThisMonth: 240_000,
}

describe('página /metas', () => {
  it('con metas: hero, tarjeta con progreso y tarjeta Nueva meta', async () => {
    getGoalsForUser.mockResolvedValue([goal])
    render(await MetasPage())
    expect(screen.getByText('Total ahorrado en metas')).toBeInTheDocument()
    expect(screen.getByText(/1 meta activa/)).toBeInTheDocument()
    expect(screen.getByText('Viaje')).toBeInTheDocument()
    expect(screen.getByText('Meta · dic 2026')).toBeInTheDocument()
    expect(screen.getByText('48% completado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nueva meta/i })).toBeInTheDocument()
  })

  it('vacío: CTA con la tarjeta Nueva meta y sin hero', async () => {
    getGoalsForUser.mockResolvedValue([])
    render(await MetasPage())
    expect(screen.getByText(/Crea tu primera meta/)).toBeInTheDocument()
    expect(screen.queryByText('Total ahorrado en metas')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nueva meta/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run tests/metas-page.test.tsx`
Expected: FAIL, la página actual renderiza `ComingSoon`.

- [ ] **Step 3: Implementar la página**

Reemplazar TODO el contenido de `app/(app)/metas/page.tsx`:

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getGoalsForUser, goalProgress, goalDateLabel } from '@/lib/goals'
import { formatShortDateUTC } from '@/lib/recurrence'
import { GoalsHero } from '@/components/growly/goals-hero'
import { GoalCard } from '@/components/growly/goal-card'
import { GoalDialog } from '@/components/growly/goal-dialog'

export default async function MetasPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const now = new Date()
  const goals = await getGoalsForUser(session.user.id, now)

  const totalSaved = goals.reduce((s, g) => s + g.saved, 0)
  const savedThisMonth = goals.reduce((s, g) => s + g.savedThisMonth, 0)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Metas</h1>

      {goals.length === 0 ? (
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <p className="mb-4 text-sm text-muted-foreground">
            Crea tu primera meta de ahorro: un sobre virtual para ese viaje, el fondo de emergencia
            o lo que quieras conseguir.
          </p>
          <GoalDialog />
        </div>
      ) : (
        <>
          <GoalsHero totalSaved={totalSaved} activeCount={goals.length} savedThisMonth={savedThisMonth} />
          <div className="grid gap-4 md:grid-cols-2">
            {goals.map((g) => {
              const p = goalProgress(g, g.saved)
              return (
                <GoalCard
                  key={g.id}
                  goal={{
                    id: g.id,
                    name: g.name,
                    emoji: g.emoji,
                    colorHex: g.colorHex,
                    targetAmount: g.targetAmount,
                    saved: g.saved,
                    pct: p.pct,
                    barPct: p.barPct,
                    completed: p.completed,
                    dateLabel: goalDateLabel(g.targetDate),
                    initial: {
                      name: g.name,
                      emoji: g.emoji ?? '',
                      colorHex: g.colorHex,
                      targetAmountStr: (g.targetAmount / 100).toFixed(2),
                      targetDate: g.targetDate ? g.targetDate.toISOString().slice(0, 10) : '',
                    },
                    contributions: g.contributions.map((c) => ({
                      id: c.id,
                      amount: c.amount,
                      dateLabel: formatShortDateUTC(c.date),
                      note: c.note,
                    })),
                  }}
                />
              )
            })}
            <GoalDialog />
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verificar que pasan (y lint)**

Run: `npx vitest run tests/metas-page.test.tsx`
Expected: PASS (2 tests).

Run: `npm run lint`
Expected: sin errores nuevos (baseline conocido: 1 error pre-existente en `components/growly/category-donut.tsx`, ajeno a C3).

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/metas/page.tsx" tests/metas-page.test.tsx
git commit -m "feat: página /metas con hero, tarjetas de meta y alta"
```

---

### Task 8: Dashboard, `GoalsCard` + `getDashboardData` + recolocación del grid

**Files:**
- Create: `components/growly/goals-card.tsx`
- Modify: `lib/dashboard.ts` (función `getDashboardData`)
- Modify: `app/(app)/page.tsx` (filas de cards)
- Test: `tests/goals-card.test.tsx`
- Test: Modify `tests/dashboard.test.ts` (añadir un describe al final)

**Interfaces:**
- Consumes: `getGoalsForUser` + `goalProgress` (Tasks 2-3), `BudgetCard`/`CategoryDonut` existentes.
- Produces:
  - `type GoalsSummaryItem = { id: string; name: string; emoji: string | null; colorHex: string; pct: number; barPct: number }` en `goals-card.tsx`.
  - `GoalsCard({ goals: GoalsSummaryItem[] })`: hasta 3 metas; vacío → link a `/metas`.
  - `getDashboardData` devuelve además `goals: GoalsSummaryItem[]` (top 3 por orden de `getGoalsForUser`).
  - Layout del dashboard (spec §9): fila 2 = `md:grid-cols-3` **BudgetCard | Próximos pagos | GoalsCard**; fila 3 nueva = `md:grid-cols-2` **CategoryDonut | Movimientos recientes**.

- [ ] **Step 1: Escribir los tests del card**

Crear `tests/goals-card.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GoalsCard } from '@/components/growly/goals-card'

const goals = [
  { id: 'g1', name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6', pct: 48, barPct: 48 },
  { id: 'g2', name: 'Fondo', emoji: '🛡️', colorHex: '#10B981', pct: 105, barPct: 100 },
  { id: 'g3', name: 'Portátil', emoji: '💻', colorHex: '#8B7CF6', pct: 10, barPct: 10 },
]

describe('GoalsCard', () => {
  it('muestra título y hasta 3 metas con emoji, nombre y %', () => {
    render(<GoalsCard goals={goals} />)
    expect(screen.getByText('Metas de ahorro')).toBeInTheDocument()
    expect(screen.getByText('Viaje')).toBeInTheDocument()
    expect(screen.getByText('48%')).toBeInTheDocument()
    expect(screen.getByText('105%')).toBeInTheDocument()
    expect(screen.getByText('✈️')).toBeInTheDocument()
  })
  it('la barra usa el color de la meta y se capa al 100%', () => {
    render(<GoalsCard goals={goals} />)
    const bars = screen.getAllByTestId('goals-card-bar')
    expect(bars[0]).toHaveStyle({ width: '48%', backgroundColor: '#3B82F6' })
    expect(bars[1]).toHaveStyle({ width: '100%', backgroundColor: '#10B981' })
  })
  it('vacío: estado con link a /metas', () => {
    render(<GoalsCard goals={[]} />)
    expect(screen.getByText(/Aún no tienes metas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Crear meta/i })).toHaveAttribute('href', '/metas')
  })
})
```

- [ ] **Step 2: Verificar que fallan e implementar `GoalsCard`**

Run: `npx vitest run tests/goals-card.test.tsx`
Expected: FAIL, `Cannot find module '@/components/growly/goals-card'`.

Crear `components/growly/goals-card.tsx`:

```tsx
import Link from 'next/link'

export type GoalsSummaryItem = {
  id: string
  name: string
  emoji: string | null
  colorHex: string
  pct: number
  barPct: number
}

export function GoalsCard({ goals }: { goals: GoalsSummaryItem[] }) {
  if (goals.length === 0) {
    return (
      <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-2 text-base font-extrabold text-foreground">Metas de ahorro</div>
        <p className="text-sm text-muted-foreground">
          Aún no tienes metas.{' '}
          <Link href="/metas" className="font-bold text-acc underline-offset-2 hover:underline">
            Crear meta
          </Link>
        </p>
      </div>
    )
  }
  return (
    <div className="rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-3 text-base font-extrabold text-foreground">Metas de ahorro</div>
      <div className="flex flex-col gap-3">
        {goals.map((g) => (
          <div key={g.id}>
            <div className="flex items-center gap-2 text-sm">
              <span aria-hidden>{g.emoji ?? '🎯'}</span>
              <span className="min-w-0 flex-1 truncate font-bold text-foreground">{g.name}</span>
              <span className="text-xs font-extrabold text-muted-foreground">{g.pct}%</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div
                data-testid="goals-card-bar"
                className="h-1.5 rounded-full"
                style={{ width: `${g.barPct}%`, backgroundColor: g.colorHex }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

Run: `npx vitest run tests/goals-card.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 3: Ampliar `getDashboardData` con test**

1. Añadir al FINAL de `tests/dashboard.test.ts` (comprobar imports existentes; `getDashboardData`, `prisma` y los globals de vitest ya están importados por el describe de budget de C2, no duplicar):

```ts
describe.skipIf(!process.env.DATABASE_URL)('getDashboardData · goals', () => {
  const email = `dashgoal_${Date.now()}@growly.app`
  let uid = ''
  const now = new Date()

  beforeAll(async () => {
    uid = (await prisma.user.create({ data: { name: 'DashGoal', email } })).id
  })
  afterAll(async () => {
    await prisma.goalContribution.deleteMany({ where: { userId: uid } })
    await prisma.goal.deleteMany({ where: { userId: uid } })
    await prisma.user.delete({ where: { id: uid } })
  })

  it('sin metas devuelve goals: []', async () => {
    const d = await getDashboardData(uid, now)
    expect(d.goals).toEqual([])
  })

  it('con metas devuelve top 3 con pct', async () => {
    for (const [i, name] of ['A', 'B', 'C', 'D'].entries()) {
      const g = await prisma.goal.create({
        data: { userId: uid, name, targetAmount: 100_000, colorHex: '#10B981' },
      })
      if (i === 0) {
        await prisma.goalContribution.create({
          data: { goalId: g.id, userId: uid, amount: 48_000, date: now },
        })
      }
    }
    const d = await getDashboardData(uid, now)
    expect(d.goals).toHaveLength(3)
    expect(d.goals[0]).toMatchObject({ name: 'A', pct: 48, barPct: 48 })
  })
})
```

Run: `npx vitest run tests/dashboard.test.ts`
Expected: FAIL, `d.goals` es `undefined`.

2. En `lib/dashboard.ts`:

Añadir a los imports (junto a los de budgets):

```ts
import { getGoalsForUser, goalProgress } from '@/lib/goals'
```

En el `Promise.all` de `getDashboardData`, añadir la quinta lectura:

```ts
  const [{ accounts }, txns, categories, budgets, allGoals] = await Promise.all([
    getAccountsWithBalances(userId),
    getTransactionsForUser(userId),
    getCategoriesForUser(userId),
    getBudgetsForMonth(userId, now.getFullYear(), now.getMonth(), now),
    getGoalsForUser(userId, now),
  ])
```

Antes del `return`, añadir:

```ts
  const goals = allGoals.slice(0, 3).map((g) => {
    const p = goalProgress(g, g.saved)
    return {
      id: g.id,
      name: g.name,
      emoji: g.emoji,
      colorHex: g.colorHex,
      pct: p.pct,
      barPct: p.barPct,
    }
  })
```

Y en el objeto del `return`, añadir la clave:

```ts
    goals,
```

Run: `npx vitest run tests/dashboard.test.ts`
Expected: PASS (los existentes + 2 nuevos).

- [ ] **Step 4: Recolocar el grid del dashboard**

En `app/(app)/page.tsx`:

1. Añadir el import:

```tsx
import { GoalsCard } from '@/components/growly/goals-card'
```

2. En la fila `md:grid-cols-3` (la de C2), REEMPLAZAR `<CategoryDonut breakdown={d.breakdown} />` por:

```tsx
        <GoalsCard goals={d.goals} />
```

(la fila queda: `<BudgetCard summary={d.budget} />`, card "Próximos pagos" sin cambios, `<GoalsCard goals={d.goals} />`, diseño web §9: Presupuesto | Próximos pagos | Metas de ahorro).

3. ENVOLVER la card "Movimientos recientes" existente en una nueva fila de dos columnas junto al donut: el contenido interno de "Movimientos recientes" queda byte-idéntico, solo se mueve dentro del nuevo grid:

```tsx
      <div className="grid gap-4 md:grid-cols-2">
        <CategoryDonut breakdown={d.breakdown} />

        <div className="rounded-[20px] border border-border bg-card px-6 py-4 shadow-[var(--shadow-card)]">
          {/* ...contenido existente de "Movimientos recientes" sin cambios... */}
        </div>
      </div>
```

Run: `npm run lint`
Expected: sin errores nuevos sobre el baseline.

Run: `npx vitest run`
Expected: TODA la suite verde (si algún test de DB falla solo por timeout de Neon, re-ejecutar con `--testTimeout=20000`).

- [ ] **Step 5: Commit**

```bash
git add components/growly/goals-card.tsx lib/dashboard.ts "app/(app)/page.tsx" tests/goals-card.test.tsx tests/dashboard.test.ts
git commit -m "feat: card Metas de ahorro en el dashboard y fila donut + recientes"
```

---

### Task 9: e2e, crear meta, aportar y ver el progreso

**Files:**
- Test: `tests/e2e/metas.spec.ts`

**Interfaces:**
- Consumes: flujo completo de Tasks 1-8 más el registro existente. No necesita cuentas ni movimientos (sobres virtuales).

- [ ] **Step 1: Escribir el e2e**

Crear `tests/e2e/metas.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('metas: crear meta, aportar y ver el progreso', async ({ page }) => {
  const email = `e2e_meta_${Date.now()}@growly.app`

  // registro
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Meta')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // estado vacío → nueva meta
  await page.goto('/metas')
  await expect(page.getByText(/Crea tu primera meta/)).toBeVisible()
  await page.getByRole('button', { name: /Nueva meta/i }).click()
  await page.getByLabel('Nombre').fill('Viaje a Japón')
  await page.getByRole('button', { name: '✈️' }).click()
  await page.getByLabel('Importe objetivo').fill('5000')
  await page.getByRole('button', { name: 'Guardar' }).click()

  // tarjeta visible con 0%
  await expect(page.getByText('Viaje a Japón')).toBeVisible()
  await expect(page.getByText('0% completado')).toBeVisible()
  await expect(page.getByText('Total ahorrado en metas')).toBeVisible()

  // aportar $2,400 → 48%
  await page.getByRole('button', { name: /Aportar/ }).click()
  await page.getByLabel('Importe').fill('2400')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('48% completado')).toBeVisible()
  // hero refleja el total (aparece también en la tarjeta → .first())
  await expect(page.getByText('$2,400').first()).toBeVisible()

  // dashboard muestra el card de metas
  await page.goto('/')
  await expect(page.getByText('Metas de ahorro')).toBeVisible()
  await expect(page.getByText('48%')).toBeVisible()
})
```

- [ ] **Step 2: Ejecutarlo y verificar que pasa**

Run: `npx playwright test tests/e2e/metas.spec.ts`
Expected: PASS. (Si falla por cold-start del dev server, patrón conocido: Fast Refresh interrumpe el primer flujo, re-ejecutar una vez con el server ya caliente antes de tocar nada. Depurar con `--trace on` solo si falla en caliente; NO debilitar aserciones.)

- [ ] **Step 3: Suite completa**

Run: `npx vitest run --testTimeout=20000`
Expected: toda la suite unit verde.

Run: `npx playwright test`
Expected: los 7 e2e verdes (6 previos + este).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/metas.spec.ts
git commit -m "test: e2e de metas — crear, aportar y progreso en página y dashboard"
```

---

## Spec coverage (self-review)

- §4 modelos `Goal`/`GoalContribution` + relaciones inversas → Task 1 (verbatim de la spec).
- §7.1 `getGoalsForUser` con saved/savedThisMonth y orden createdAt → Task 3 (desviación documentada: include + suma en JS con `goalTotals` puro en lugar de `_sum`, porque la página necesita la lista de aportes igualmente). `createGoalForUser`/`updateGoalForUser`/`archiveGoalForUser` (updateMany + userId) → Task 3. `addContributionForUser` con verificación de ownership / `deleteContributionForUser` → Task 3. `goalProgress` (cap 100 barra, real texto, completed) → Task 2.
- §7.2 página: hero oscuro con total/activas/+mes (Task 6 GoalsHero + Task 7), tarjeta por meta con tile emoji sobre color al 13% (alfa hex `21`), subtítulo con `goalDateLabel`, saved grande "de $X", barra colorHex, "% completado", + Aportar (Task 5 ContributionDialog con fecha default hoy y nota), completada → badge "¡Completada!" + barra verde (Task 6), menú editar/ver aportes (lista con borrar)/archivar (Tasks 5-6), tarjeta punteada "Nueva meta" con emoji sugeridos ✈️🛡️💻🏠🚗🎁💍🎓 y paleta (Task 5), estado vacío (Task 7).
- §7.3 + §9 card dashboard: "Metas de ahorro", hasta 3 metas (emoji + nombre + % + barra con color), vacío → link `/metas`; `getDashboardData` devuelve `goals`; fila queda Presupuesto | Próximos pagos | Metas (donut se recoloca con Recientes en fila de 2) → Task 8.
- §10 testing metas: agregados saved/savedThisMonth (Tasks 2-3), progreso/completada (Task 2), ownership de aportes (Tasks 3-4), actions con auth mock (Task 4), e2e crear meta + aportar → progreso actualizado (Task 9).
- §11: rama `feature/fase-2-c3`, una migración (Task 1), review final de rama antes del merge (lo orquesta la skill de ejecución).
- Lecciones C2 incorporadas: reloj fijado (`toFake:['Date']`) en tests de diálogos y página (Tasks 5, 7); `aria-label` en botones de icono (Tasks 5-6); mensajes Zod en español en todos los campos (Task 4); import de prisma al tope del archivo (Task 3).
