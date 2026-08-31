# Growly · Fase 2 — Planificación (Presupuesto · Metas · Calendario · Recurrencias)

**Fecha:** 2026-07-08 · **Estado:** aprobada por el usuario
**Precedente:** `2026-07-05-growly-mvp-design.md` (Fase 0 + Fase 1 completas y mergeadas a `master`).

## 1. Objetivo

Añadir la capa de planificación sobre el núcleo financiero del MVP:

1. **Presupuesto mensual por categoría** con progreso, excedidos y predicción.
2. **Metas de ahorro** tipo "sobres virtuales" con aportes manuales.
3. **Calendario financiero** con movimientos, pagos programados y cortes/vencimientos de tarjeta.
4. **Motor de recurrencias** que genera los pagos/cobros periódicos como movimientos `PENDING`.

Todo web (Next.js 16 App Router), mismo stack y disciplinas del MVP: dinero en centavos (`Int`),
agregados calculados (nunca mutados), toda query/mutación scoped por `userId` de `auth()`,
funciones puras testeables en `lib/`, server actions con Zod + try/catch + `revalidatePath`.

## 2. Decisiones acordadas (2026-07-08)

| Tema | Decisión |
|---|---|
| Modelo de presupuesto | **Solo por categoría** (no por cuenta ni tipo). Total = suma de límites. |
| Almacenamiento de límites | **Un registro por categoría y mes** con auto-copia del mes anterior. |
| Aportes a metas | **Sobres virtuales**: contador aparte, no tocan cuentas ni movimientos. |
| Recurrencias al vencer | **Confirmación manual con un click** (PENDING → CLEARED). Nada toca saldos solo. |
| Generación de ocurrencias | **Materialización perezosa** al usar la app, horizonte 90 días, idempotente. Sin cron. |
| Calendario en web | **Ruta propia `/calendario`** en el sidebar, entre Metas y Cuentas. |
| Transferencias recurrentes | Fuera de alcance (YAGNI). Solo INCOME/EXPENSE. |

## 3. Referencias de diseño (Claude Design, projectId `fc0d7a55-095b-4ca7-b546-31cfd561f70c`)

- **`Growly App.dc.html`** (móvil) tiene las pantallas completas: Presupuesto (`isPresupuesto`),
  Metas (`isMetas`), Calendario (`isCalendario`). Son la referencia visual principal; se
  extrapolan a escritorio igual que se hizo con Cuentas y Movimientos.
- **`Growly Web.dc.html`** (dashboard 1440px) trae las dos cards nuevas del dashboard:
  **Presupuesto** (86% badge ámbar, `$3,880 / $4,500`, barra, top-3 categorías con %,
  excedida en rojo `#C9584F`) y **Metas de ahorro** (3 barras con emoji + nombre + %).
- No existe diseño para la gestión de recurrencias → libertad de diseño siguiendo el design
  system (diálogos Base UI como los existentes).

## 4. Modelos de datos (Prisma)

Cuatro modelos nuevos y un campo nuevo en `Transaction`. Una migración por sub-plan.

```prisma
model Budget {
  id         String   @id @default(cuid())
  userId     String
  categoryId String
  year       Int
  month      Int      // 0-11, convención JS Date — igual que lib/dashboard
  amount     Int      // centavos
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  @@unique([userId, categoryId, year, month])
  @@index([userId, year, month])
}

model Goal {
  id           String    @id @default(cuid())
  userId       String
  name         String
  emoji        String?   // "✈️", "🛡️"… como el diseño
  colorHex     String    @default("#10B981")
  targetAmount Int       // centavos, > 0
  targetDate   DateTime? // null = "sin fecha"
  archived     Boolean   @default(false)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  user          User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  contributions GoalContribution[]
  @@index([userId])
}

model GoalContribution {
  id      String   @id @default(cuid())
  goalId  String
  userId  String   // scoping directo para queries/deletes
  amount  Int      // centavos, > 0 (retirar = borrar el aporte)
  date    DateTime @default(now())
  note    String?
  goal    Goal     @relation(fields: [goalId], references: [id], onDelete: Cascade)
  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([goalId])
}

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
  type                TransactionType     // solo INCOME | EXPENSE (validado en Zod)
  amount              Int                 // centavos, > 0
  description         String
  frequency           RecurrenceFrequency
  startDate           DateTime            // primera ocurrencia; ancla de la serie
  endDate             DateTime?           // última fecha generable (inclusive)
  active              Boolean             @default(true)
  materializedThrough DateTime?           // hasta dónde ya se generaron PENDING
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  account      Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  category     Category?     @relation(fields: [categoryId], references: [id])
  transactions Transaction[]
  @@index([userId])
}

// Transaction gana:
//   recurringRuleId String?
//   recurringRule   RecurringRule? @relation(fields: [recurringRuleId], references: [id], onDelete: SetNull)
```

(`User`, `Account`, `Category` ganan las relaciones inversas correspondientes.)

## 5. Motor de recurrencias (C1)

### 5.1 `lib/recurrence.ts` — puro

- `nextOccurrences(rule, fromExclusive: Date, toInclusive: Date): Date[]` — fechas de la serie
  dentro del rango. El ancla es `startDate`:
  - `MONTHLY`/`YEARLY`: mismo día del mes/año que `startDate`, con **ajuste de fin de mes**
    (regla anclada al 31 → 30 abr, 28/29 feb; nunca se desliza al mes siguiente).
  - `WEEKLY`: mismo día de la semana. `BIWEEKLY`: cada 14 días exactos desde `startDate`.
  - Respeta `endDate` (inclusive). Serie vacía si `fromExclusive >= toInclusive`.
- Helper `describeFrequency(rule)` → "Cada mes · día 12", "Cada 2 semanas · lunes", etc.

### 5.2 `lib/recurring.ts` — acceso a datos (scoped por userId)

- `materializeRecurringForUser(userId, now)`:
  1. Horizonte = `now + 90 días`.
  2. Por cada regla `active` con `materializedThrough < horizonte` (o null):
     genera ocurrencias en `(max(materializedThrough, startDate - 1ms), min(horizonte, endDate)]`,
     crea `Transaction` `PENDING` (`recurringRuleId`, `type`, `amount`, `description`,
     `accountId`, `categoryId`) y actualiza `materializedThrough = horizonte` — **todo dentro de
     `prisma.$transaction`** (idempotencia: la marca y las filas se mueven juntas).
  3. Si no hay nada pendiente, retorna sin escribir (rápido; se llama en cada carga).
- CRUD de reglas: `createRecurringRuleForUser`, `updateRecurringRuleForUser`,
  `setRecurringRuleActiveForUser`, `deleteRecurringRuleForUser`, `getRecurringRulesForUser`
  (con `nextDate` calculada para la UI).
- **Semántica de edición (predecible, documentada en UI):**
  - Borrar una ocurrencia PENDING suelta = "saltar esa vez"; no se regenera (la
    materialización nunca vuelve detrás de `materializedThrough`).
  - Editar la regla / pausar / borrar la regla → se **borran sus PENDING con `date > now`**
    y (si sigue activa) se re-materializa desde `now` (`materializedThrough = now` antes de
    regenerar). Ocurrencias pasadas y CLEARED nunca se tocan. Al borrar la regla, el
    histórico CLEARED queda con `recurringRuleId = null` (SetNull).
- `confirmTransactionForUser(userId, id)` — `updateMany({ id, userId, status: PENDING })` →
  `CLEARED` (la fecha no cambia). Retorna `{ ok: false }` si no encontró fila.

### 5.3 Actions y UI

- `lib/recurring-actions.ts`: create/update/pause/delete regla + `confirmTransaction` —
  patrón actual (auth() + Zod + ownership check de cuenta/categoría + try/catch +
  `revalidatePath('/movimientos', '/', '/calendario')`).
- `transactionSchema`-style `recurringRuleSchema` en `lib/validators.ts`: type ∈
  {INCOME, EXPENSE}, amount > 0, frequency, startDate, endDate opcional > startDate.
  **`startDate` no puede ser pasada** (>= hoy 00:00): evita que crear una regla "desde enero"
  inunde la app de PENDING vencidos; el picker abre en hoy. (Al editar, una startDate ya
  pasada de una regla existente se conserva sin re-validar.)
- **`/movimientos` gana pestañas "Movimientos | Recurrentes"** (client component, estado local):
  - Pestaña Recurrentes: filas (icono de categoría, descripción, `describeFrequency`,
    "próxima: 12 jul", monto con signo, cuenta) + menú (pausar/reanudar, editar, borrar)
    + botón "Nueva recurrencia" → diálogo Base UI (tipo gasto/ingreso, monto, descripción,
    categoría, cuenta, frecuencia, primera fecha, fecha fin opcional).
  - Pestaña Movimientos (la actual): filas PENDING ganan badge — `date <= now` → "Vencido" +
    botón **Confirmar**; `date > now` → "Programado".
- La página llama `materializeRecurringForUser` antes de leer datos (igual el dashboard en
  `getDashboardData` y `/calendario`).
- Beneficio inmediato sin código extra: los PENDING generados alimentan "Próximos pagos" y
  "Comprometido" del dashboard existente.

## 6. Presupuesto (C2)

### 6.1 `lib/budgets.ts`

- `getBudgetsForMonth(userId, year, month)` — lee los budgets del mes. **Auto-copia:** si el
  mes pedido es el actual, no tiene filas y algún mes de los 12 anteriores sí, copia el más
  reciente (misma transacción). *Caso borde aceptado:* si el usuario borra todas las
  categorías del mes actual, reaparecen al recargar; para "no presupuestar" se quitan
  categorías individuales o se pone el límite del resto en su valor deseado.
- `upsertBudgetForUser(userId, { categoryId, year, month, amount })` (upsert por unique),
  `deleteBudgetForUser(userId, id)`.
- Puros:
  - `budgetProgress(budgets, txns, year, month)` → por categoría `{ categoryId, limit, spent,
    pct, over }` + totales `{ limit, spent, pct, available }`. `spent` = EXPENSE **CLEARED**
    del mes (consistente con los KPIs del dashboard).
  - `budgetForecast(totals, now)` → proyección run-rate: `spent / díasTranscurridos ×
    díasDelMes` (0 si es día 1 sin gasto), y `daysLeft`.

### 6.2 Página `/presupuesto`

- Header "Presupuesto" + selector de mes ‹ Julio 2026 › (navegable a pasados y futuros;
  query param `?m=2026-07`, default mes actual). Ojo con la convención: el param usa mes
  humano 1-12 y la DB/código usan 0-11 — la conversión vive solo en el parseo del param
  (helper compartido con `/calendario`).
- Hero oscuro (patrón BalanceHero): "Gastado de $4,500" → `$3,880` grande, `$620 disponible`
  a la derecha, barra de progreso, "86% del presupuesto usado · quedan 27 días", y línea de
  predicción: "A este ritmo: ~$4,340 este mes" (en rojo si supera el total).
- Sección "Por categoría": tarjeta por categoría presupuestada — dot del color, nombre,
  `$930 / $1,000`, barra con el color de la categoría; **excedida → monto y barra en
  `#C9584F`** (barra al 100%). Click/menú → editar límite o quitar. Botón "Añadir categoría"
  → diálogo (select de categorías EXPENSE sin presupuesto ese mes + importe).
- Solo categorías `kind = EXPENSE`. Estado vacío: CTA "Crea tu primer presupuesto".

### 6.3 Card del Dashboard

`components/growly/budget-card.tsx` según el diseño web: título "Presupuesto", badge de %
total (verde `< 85`, ámbar `85–100`, rojo `> 100`), `$3,880 / $4,500`, barra, top-3
categorías por % (excedida en rojo). Sin presupuesto → estado vacío con link a `/presupuesto`.
`getDashboardData` incorpora el resumen.

## 7. Metas (C3)

### 7.1 `lib/goals.ts`

- `getGoalsForUser(userId)` — metas no archivadas con `saved` (suma de aportes,
  `_sum` aggregate) y `savedThisMonth`; orden por `createdAt`.
- `createGoalForUser`, `updateGoalForUser`, `archiveGoalForUser` (updateMany + userId).
- `addContributionForUser(userId, { goalId, amount, date?, note? })` — verifica que la meta
  es del usuario; `deleteContributionForUser(userId, id)`.
- Puro: `goalProgress(goal, saved)` → `{ pct (cap 100 para la barra, real para el texto),
  completed }`.

### 7.2 Página `/metas`

- Hero oscuro: "Total ahorrado en metas" → `$11,300`, "3 metas activas · +$620 este mes".
- Tarjeta por meta (diseño móvil): tile 42px con emoji sobre fondo `colorHex` al 13%, nombre,
  subtítulo "Meta · dic 2026" / "Meta · sin fecha", derecha `$2,400` grande "de $5,000",
  barra con `colorHex`, "48% completado", acción **+ Aportar** → diálogo (importe, fecha
  default hoy, nota opcional). Meta `saved >= target` → badge "¡Completada!" y barra verde.
- Menú por meta: editar, ver aportes (lista con borrar), archivar.
- Tarjeta punteada "Nueva meta" → diálogo: nombre, emoji (input corto con sugerencias
  ✈️ 🛡️ 💻 🏠 🚗 🎁 💍 🎓), color (paleta del design system), importe objetivo, fecha opcional.
- Estado vacío: CTA con la tarjeta "Nueva meta".

### 7.3 Card del Dashboard

`components/growly/goals-card.tsx`: "Metas de ahorro", hasta 3 metas activas (emoji + nombre +
% + barra con su color). Vacío → link a `/metas`.

## 8. Calendario (C4)

### 8.1 `lib/calendar.ts` — puro

- `calendarEvents(txns, accounts, year, month)` → `Map<dayKey, CalendarEvent[]>` donde
  `CalendarEvent = { kind: 'income' | 'expense' | 'card', date, label, amount?, meta }`:
  - Movimientos del mes (todos los status; PENDING se etiqueta "programado").
  - Por cada tarjeta activa (`CREDIT_CARD`, no archivada): evento "Corte · <tarjeta>" el
    `statementDay` y "Pago tarjeta · <tarjeta>" el `dueDay` (con ajuste si el día no existe
    en el mes: 31 → último día). Sin importe.
- `calendarMonthTotals(txns, year, month)` → `{ income, expense }` del mes contando CLEARED
  **y** PENDING (el calendario es planificación; se anota la diferencia con los KPIs).
- Dots del mes: verde = ingreso, rojo = gasto/pago, gris = evento de tarjeta (si un día tiene
  varios tipos, prioridad rojo > verde > gris).

### 8.2 Página `/calendario` + sidebar

- Nueva entrada en `NAV_ITEMS` entre Metas y Cuentas: `{ href: '/calendario',
  label: 'Calendario', icon: CalendarDays }`.
- Layout escritorio dos paneles: izquierda la tarjeta calendario (chips "Ingresos jul
  +$6,120" verde / "Pagos jul −$2,036" rojo encima; navegación ‹ Julio 2026 ›; cabecera
  L M X J V S D — semana empieza lunes; hoy en círculo verde relleno; dot bajo los días con
  eventos), derecha la agenda del día seleccionado ("VIERNES · 5 JUL"): filas icono +
  nombre + subtítulo ("Pago programado" rojo si PENDING, nombre de categoría si CLEARED,
  "Corte de tarjeta"/"Pago de tarjeta") + monto con signo.
- Selección de día client-side; default hoy (o día 1 si es otro mes). Meses navegables con
  `?m=2026-07`. La página llama `materializeRecurringForUser` antes de leer.

## 9. Integración del Dashboard

`getDashboardData` se amplía: llama `materializeRecurringForUser(userId, now)` al inicio, y
devuelve además `budget` (resumen para el card) y `goals` (top 3). La fila de cards del
diseño web queda: **Presupuesto | Próximos pagos | Metas de ahorro** (grid 3 col).
El chart "Flujo de caja" del diseño es Fase 3 (Reportes) — fuera de alcance.

## 10. Testing

Mismo esquema que Fase 1 (Vitest + RTL unit, `.skipIf(!DATABASE_URL)` para DB, Playwright e2e,
`workers: 1`):

- **Recurrencias** (los más importantes): `nextOccurrences` — mensual normal, ancla día 31
  (abr→30, feb→28), 29 feb bisiesto/no bisiesto, BIWEEKLY, WEEKLY, YEARLY, endDate inclusive,
  rango vacío. `materializeRecurringForUser` — genera exactamente las que faltan, idempotente
  (segunda llamada = 0 filas), regla pausada no genera, borrar PENDING no se regenera, editar
  regla borra futuras y regenera. `confirmTransactionForUser` — CLEARED + ownership.
- **Presupuesto**: `budgetProgress` (normal, excedido, sin gasto, ignora PENDING y otros
  meses), `budgetForecast` (run-rate, día 1), auto-copia (mes vacío copia, mes con filas no,
  mes pasado no copia).
- **Metas**: agregados saved/savedThisMonth, progreso/completada, ownership de aportes.
- **Calendario**: merge de eventos, ajuste statementDay/dueDay 31→30, totales con PENDING,
  prioridad de dots.
- **Actions**: auth mock + ownership (cuenta/categoría ajena → error) como en Fase 1.
- **e2e** (4): crear recurrencia → aparece PENDING en Movimientos y en próximos pagos;
  confirmar vencido → saldo baja en /cuentas; crear presupuesto → hero y categoría visibles;
  crear meta + aportar → progreso actualizado.

## 11. Ejecución

4 sub-planes con subagent-driven-development, **merge a master tras cada uno** (patrón Fase 1),
cada uno con su migración Prisma y su review final de rama:

| Sub-plan | Contenido | Dependencias |
|---|---|---|
| **C1 Recurrencias** | schema RecurringRule + `recurringRuleId`, lib/recurrence + lib/recurring, confirmación, pestañas en /movimientos | — |
| **C2 Presupuesto** | schema Budget, lib/budgets, /presupuesto, card dashboard | — |
| **C3 Metas** | schema Goal + GoalContribution, lib/goals, /metas, card dashboard | — |
| **C4 Calendario** | lib/calendar, /calendario, sidebar | C1 (mejor con PENDING reales) |

Orden: C1 → C2 → C3 → C4.

## 12. Fuera de alcance (Fase 3+)

- Chart "Flujo de caja" del dashboard, reportes y estadísticas avanzadas (Fase 3).
- Alertas inteligentes y notificaciones — el calendario y el presupuesto dejan los datos
  listos (excedidos, vencimientos) para las alertas de Fase 3.
- Transferencias recurrentes; auto-registro de recurrencias sin confirmación.
- Presupuestos por cuenta o por tipo; presupuesto de ingresos.
- Metas vinculadas a cuentas o con movimientos reales; retiros parciales como primera clase
  (se cubre borrando aportes).
- Deuda técnica que sigue pendiente de Fase 1: CI con Postgres, `aria-hidden` en iconos,
  token `--line`, wiring del botón "Añadir" del topbar.
