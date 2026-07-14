# Growly · Fase 3 — Inteligencia (Reportes · Alertas · Notificaciones)

**Fecha:** 2026-07-14 · **Estado:** aprobada por el usuario
**Precedentes:** `2026-07-05-growly-mvp-design.md` (Fase 0+1) y `2026-07-08-growly-fase-2-design.md`
(Fase 2 completa y mergeada: recurrencias, presupuesto, metas, calendario, convención de fechas UTC unificada).

## 1. Objetivo

Añadir la capa de inteligencia sobre el núcleo + planificación:

1. **Reportes/Estadísticas**: página `/reportes` real (hoy placeholder) y el dashboard completo del diseño web.
2. **Alertas inteligentes**: motor que detecta condiciones (presupuesto al límite, pagos por vencer,
   tarjeta próxima a vencer) usando los datos que F2 dejó listos.
3. **Notificaciones in-app**: centro de notificaciones persistido con estado leído/no-leído,
   alimentado por las alertas, con campana + badge en el topbar.

Mismo stack y disciplinas: dinero en centavos `Int`, todo scoped por `userId` de `auth()`, funciones
puras testeables en `lib/`, server actions con Zod (ids incluidos) + try/catch + `revalidatePath`,
**convención de fechas unificada de C4** (fechas de datos = medianoche UTC leídas con getters UTC;
"hoy"/"mes actual" desde componentes locales de `now`), UI en español con los tokens del design system.

## 2. Decisiones acordadas (2026-07-14)

| Tema | Decisión |
|---|---|
| Canal de notificaciones | **Solo in-app** (campana + centro). Email/push → Fase 4. |
| Generación de alertas | **Evaluación perezosa al usar la app** (dashboard y centro), idempotente vía dedupe. Sin cron. |
| Persistencia | **Tabla `Notification`** con `dedupeKey` único por usuario (historial real, leído/no-leído, timestamps). |
| Alertas v1 | Presupuesto 85% / excedido · Pagos PENDING por vencer (≤3 días) y vencidos · Pago de tarjeta próximo (dueDay ≤5 días con saldo usado). **NO** meta completada. |
| Alcance de reportes | Página `/reportes` completa + dashboard: chart "Flujo de caja" (diferido de F2 §9) y deltas "▲ 8% vs jun" en KPIs. |
| Charts | **SVG/CSS propio** (como CategoryDonut y como el propio diseño). Sin librerías, render en servidor, sin tooltips en v1. |

## 3. Referencias de diseño (Claude Design, projectId `fc0d7a55-095b-4ca7-b546-31cfd561f70c`)

- **`Growly App.dc.html`** — pantalla **Reportes** (`isReportes`): toggle "6 meses | Año", card
  "Ingresos vs Gastos" (barras agrupadas verde `#10b981` / rojo `#c9584f` por mes, mes actual en
  negrita), dos KPI tiles ("Tasa de ahorro 37% · +5 pts vs jun" en verde acc; "Gasto medio/día $125 ·
  −$8 vs jun"), card "Top categorías" (nombre, importe, barra proporcional con el color de la categoría,
  la mayor al 100%).
- **`Growly App.dc.html`** — pantalla **Notificaciones** (`isNotif`): chips "Todas | No leídas · 3",
  tarjetas con icono 40px tintado por tipo (rojo tarjeta, ámbar "!" presupuesto, verde ingreso), título
  bold, cuerpo muted, tiempo relativo ("Hace 2 h", "Hoy · 09:12", "Ayer"), dot verde de no-leída,
  leídas con `opacity:.62`. La tarjeta "Nuevo inicio de sesión" del diseño queda FUERA (seguridad, no finanzas).
- **`Growly Web.dc.html`** — dashboard: card **"Flujo de caja · Últimos 6 meses"** (toggle 6M/1A,
  SVG línea de ingresos `#10b981` grosor 3 con área `rgba(16,185,129,.1)` + línea de gastos `#c9584f`
  punteada `2 5`, 3 gridlines, etiquetas de mes abajo con el actual en negrita) en fila
  `1.8fr / 1fr` junto al donut de Categorías; KPIs con delta "▲ 8% vs jun" / "▼ 4% vs jun"; campana
  del topbar con dot rojo de no-leídas.

## 4. Modelo de datos (Prisma)

Un modelo nuevo; migración única en D2. `User` gana la relación inversa `notifications Notification[]`.

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

## 5. Motor de alertas (D2)

### 5.1 `lib/alerts.ts` — puro

`alertCandidates(input, now)` recibe datos ya cargados y devuelve
`{ type, title, body, dedupeKey }[]`. Reglas y claves (mes en formato `YYYY-MM` humano):

| Tipo | Condición | dedupeKey | Copy (título / cuerpo) |
|---|---|---|---|
| `BUDGET_WARN` | presupuesto del mes actual con `85 ≤ pct ≤ 100` | `budget-85-2026-07` | "Cerca del límite de presupuesto" / "Llevas el NN% de tu presupuesto de julio." |
| `BUDGET_OVER` | `pct > 100` | `budget-over-2026-07` | "Presupuesto de julio superado" / "Llevas el NN% del límite ($X de $Y)." |
| `PAYMENT_DUE` | PENDING con `now < date ≤ now+3 días` | `tx-due-<txId>` | "Pago próximo" / "<desc> ($X) vence en N días." |
| `PAYMENT_OVERDUE` | PENDING con `date ≤ now` | `tx-overdue-<txId>` | "Pago vencido" / "<desc> ($X) está pendiente de confirmar." |
| `CARD_DUE` | tarjeta activa con `dueDay` cuyo próximo vencimiento cae en ≤5 días y `used > 0` | `card-due-<accountId>-2026-07` | "Pago de tarjeta próximo" / "El pago de <name> ($used) vence el D de <mes>." |

Notas:
- Máximo una WARN y una OVER por mes (clave mensual). Ambas pueden existir en el mismo mes
  (cruzó 85 y días después 100): son filas distintas.
- "En N días" y "% actual" se congelan en el body al crearla (el diseño muestra texto estático).
- Los umbrales usan el `pct` redondeado de `budgetProgress` (consistente con card y página).
- `PAYMENT_*` usa comparación de instantes contra `now` (misma semántica que el badge
  Vencido/Programado de /movimientos). El próximo `dueDay` de tarjeta se calcula con la
  convención UTC (día ajustado al último del mes si no existe, como en `lib/calendar.ts`).
- Confirmar/borrar la transacción o pagar la tarjeta NO borra la notificación: es historial.
- Helper puro `relativeTimeLabel(date, now)` → "Ahora" (<1 min) · "Hace N min" · "Hace N h" ·
  "Ayer" · "D mes" (getters UTC para fechas, local para el corte de "hoy", como el resto).

### 5.2 `lib/notifications.ts` — acceso a datos (scoped por userId)

- `evaluateAlertsForUser(userId, now)`:
  1. Carga presupuesto del mes (con `getBudgetsForMonth` + `budgetProgress` sobre txns),
     PENDING del usuario y tarjetas con `used` (de `getAccountsWithBalances`).
  2. `alertCandidates(...)` → `createMany({ data, skipDuplicates: true })` apoyado en el
     unique `[userId, dedupeKey]` — idempotente y barato (patrón materialize de C1).
  3. Si no hay candidatas, no escribe.
- `getNotificationsForUser(userId, { unreadOnly? })` — orden `createdAt` desc.
- `getUnreadCountForUser(userId)`.
- `markNotificationReadForUser(userId, id)` (updateMany + userId, `readAt: now`),
  `markAllNotificationsReadForUser(userId)`.
- `lib/notification-actions.ts`: `markNotificationRead(id)` y `markAllNotificationsRead()`
  con auth() + `idSchema` + try/catch + `revalidatePath('/notificaciones')` y `revalidatePath('/')`.
- **Triggers de evaluación:** `getDashboardData` (tras materializar recurrencias) y la página
  `/notificaciones` llaman `evaluateAlertsForUser` antes de leer.

### 5.3 UI de notificaciones

- **Campana del topbar** (el botón ya existe sin cablear): pasa a `<Link href="/notificaciones">`
  con badge rojo con el número de no leídas (oculto si 0). El layout `(app)` obtiene el count con
  `getUnreadCountForUser` y lo pasa al `Topbar`.
- **Página `/notificaciones`** (NO entra en NAV_ITEMS; se llega por la campana): header con botón
  "Marcar todas como leídas" (visible si hay no leídas), chips "Todas | No leídas · N" (`?f=noleidas`),
  lista de tarjetas según el diseño (icono por tipo: `BUDGET_*` → "!" ámbar/rojo, `PAYMENT_*` →
  recibo rojo, `CARD_DUE` → tarjeta roja; título, cuerpo, `relativeTimeLabel`, dot de no leída,
  leídas con opacidad reducida). Click en una no leída → `markNotificationRead`.
  Estado vacío: "Sin notificaciones. Aquí verás avisos de presupuesto, pagos y tarjetas."

## 6. Reportes (D1)

### 6.1 `lib/reports.ts` — puro

- `monthlySeries(txns, now, months)` → `[{ year, month, income, expense }]` de los últimos
  `months` meses terminando en el actual (CLEARED only, reutiliza la semántica de `monthlyTotals`;
  fechas de datos con getters UTC, mes actual con componentes locales de `now`).
- `reportKpis(series, now)` → `{ savingsRate, savingsRateDelta, avgDailyExpense, avgDailyExpenseDelta }`:
  - `savingsRate` del mes actual (como el KPI existente) y delta en **puntos** vs mes anterior.
  - `avgDailyExpense` = gasto del mes actual / días transcurridos (`now.getDate()`); el del mes
    anterior usa sus días totales; delta en centavos (negativo = gastas menos → verde).
- `categoryTotalsForRange(txns, categories, fromYm, toYm)` → top categorías EXPENSE CLEARED del
  rango (suma, orden desc, color; la mayor marca el 100% de la barra). `fromYm/toYm` = `{year, month}` inclusive.
- `kpiDeltas(series)` → para el dashboard: `{ incomePct, expensePct }` variación % del mes actual
  vs anterior (null si el mes anterior fue 0).

### 6.2 Página `/reportes`

- Reemplaza el placeholder. Header "Reportes" + toggle "**6 meses | Año**" (`?p=6m` default | `?p=1a` → 12).
- Card "Ingresos vs Gastos": barras agrupadas por mes (SVG/CSS propio, altura proporcional al máximo
  de la serie, verde ingresos / rojo gastos), leyenda, etiqueta del mes actual en negrita.
- Dos KPI tiles: "Tasa de ahorro NN% · ±N pts vs <mes-1>" (verde si sube) y "Gasto medio/día $X ·
  ±$N vs <mes-1>" (verde si baja).
- Card "Top categorías": hasta 5 del periodo seleccionado, con barra proporcional del color de la categoría.
- Estado vacío (sin movimientos en el periodo): "Aún no hay datos suficientes. Registra movimientos
  para ver tus estadísticas."

### 6.3 Dashboard (completa el diseño web)

- Nueva fila tras los KPIs: `grid md:grid-cols-[1.8fr_1fr]` → card **"Flujo de caja · Últimos 6 meses"**
  (SVG: línea de ingresos sólida con área + línea de gastos punteada, 3 gridlines, meses abajo)
  + **CategoryDonut** (se muda aquí desde la fila con Recientes).
- La fila Presupuesto | Próximos pagos | Metas no cambia. **Movimientos recientes vuelve a ancho
  completo** (como era antes de C3).
- `KpiCard` gana `delta?: { pct: number; goodWhenUp: boolean }` → "▲ 8% vs jun" / "▼ 4% vs jun"
  (verde si la dirección es buena: ingresos ↑ verde, gastos ↓ verde; rojo en caso contrario; sin
  delta si el mes anterior no tiene datos). El KPI de Ahorro conserva su subtítulo "% tasa" actual.
- `getDashboardData` añade en D1: `cashflow` (serie de 6 meses vía `monthlySeries`) y `deltas`
  (vía `kpiDeltas`). La llamada a `evaluateAlertsForUser` (§5.2) se añade después, en D2.

## 7. Testing

Mismo esquema (Vitest + RTL unit, `.skipIf(!DATABASE_URL)` para DB, Playwright e2e, reloj fijado
`toFake:['Date']` donde "hoy" importe):

- **Alertas (lo más importante):** `alertCandidates` — cada regla con sus umbrales exactos
  (84→nada, 85→WARN, 100→WARN, 101→OVER; vence en 3 días→DUE, en 4→nada, ayer→OVERDUE;
  tarjeta con used 0→nada, dueDay a 6 días→nada, a 5→CARD_DUE, ajuste 31→fin de mes), claves
  estables y copys. `relativeTimeLabel` (minutos/horas/ayer/fecha).
- **DB:** `evaluateAlertsForUser` idempotente (2ª llamada = 0 filas nuevas; cruzar de 85 a 101 crea
  la OVER sin duplicar la WARN), `getUnreadCount`, `markRead`/`markAllRead` con ownership
  (usuario ajeno → no encontrado).
- **Reportes:** `monthlySeries` (N meses, cruces de año, meses vacíos en 0, ignora PENDING/TRANSFER),
  `reportKpis` (deltas en pts y $, mes anterior vacío), `categoryTotalsForRange` (rango inclusive,
  orden, top N), `kpiDeltas` (null con mes anterior 0).
- **Componentes/páginas RTL:** campana con badge (0 = sin badge), tarjeta de notificación
  (tipos/tinte/dot/opacidad), página /notificaciones (filtro no leídas, marcar todas), charts con
  datos deterministas (alturas/puntos), página /reportes (toggle 6m/1a, KPIs con deltas), dashboard
  con cashflow y deltas.
- **e2e (2):** (1) gasto que cruza el 85% del presupuesto → campana con badge → centro muestra la
  alerta → marcar leída → badge desaparece; (2) /reportes muestra Ingresos vs Gastos y top categorías
  tras registrar ingreso + gasto.

## 8. Ejecución

2 sub-planes con subagent-driven-development, merge a master tras cada uno, review final de rama
(patrón C1-C4; modelos: haiku para tareas con código verbatim, sonnet integración/e2e/reviewers,
top para el review final):

| Sub-plan | Contenido | Migración |
|---|---|---|
| **D1 Reportes** | `lib/reports.ts`, página `/reportes`, dashboard (Flujo de caja + donut recolocado + deltas KPI + recientes full-width) | no |
| **D2 Alertas + Notificaciones** | schema `Notification`, `lib/alerts.ts` + `lib/notifications.ts` + actions, campana cableada, página `/notificaciones`, trigger en `getDashboardData` | `notifications` |

Orden: D1 → D2.

## 9. Fuera de alcance (Fase 4+)

- Email y push (requieren proveedor/deploy); preferencias de notificaciones en el perfil.
- Alerta de meta completada; resumen mensual automático.
- Búsqueda global (pantalla `isBusqueda` del diseño móvil) y detalle de movimiento (`isDetalle`).
- Export PDF/Excel, conectar banco, Premium, multi-moneda (Fase 4 del doc original).
- Deuda técnica que sigue en backlog: CI con Postgres, a11y (aria-hidden, aria-current), wiring del
  botón "Añadir" del topbar, queries con scope de mes, refactor withAuth de actions.
