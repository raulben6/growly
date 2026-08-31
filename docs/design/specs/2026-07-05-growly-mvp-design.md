# Growly: Spec de Diseño del MVP (Núcleo Financiero)

- **Fecha:** 2026-07-05
- **Estado:** Aprobado
- **Alcance de esta spec:** Fase 0 (Fundaciones) + Fase 1 (Núcleo financiero) de la versión **Web**.
- **Diseño de referencia:** proyecto de Claude Design `fc0d7a55-095b-4ca7-b546-31cfd561f70c` (docs: Design System, Web, App, Entrada, Conectar Banco), accesible vía el MCP `DesignSync`.

---

## 1. Objetivo

Construir la base y el núcleo funcional de Growly en web: una app de finanzas personales
que responda de inmediato **"¿cuánto dinero tengo?"** y **"¿en qué lo gasto?"**. El MVP
debe ser una **rebanada vertical completa** (UI → Server Action → base de datos → UI) sobre
la que se construyen las fases siguientes, y una **implementación de referencia** cuya API
consumirá después la app Flutter.

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| Lenguaje | TypeScript |
| Estilos | TailwindCSS + shadcn/ui |
| ORM | Prisma |
| Base de datos | PostgreSQL (Neon serverless; alternativa local con Docker) |
| Auth | Auth.js (NextAuth v5): credenciales (email+contraseña, bcrypt) + Google |
| Datos | Lectura en Server Components; mutaciones en Server Actions |
| Tests | Vitest + React Testing Library (unidad); Playwright (e2e) |
| Deploy | Vercel |

Justificación: el diseño ya está en React/Tailwind, un único proyecto Next.js reduce fricción
(un deploy, nativo en Vercel) y la API interna queda documentada y reutilizable por Flutter.

## 3. Estructura del proyecto

```
growly/
├─ app/
│  ├─ (auth)/
│  │  ├─ login/
│  │  ├─ register/
│  │  └─ forgot-password/
│  ├─ (app)/                 layout con sidebar + topbar (rutas protegidas)
│  │  ├─ page.tsx            → Inicio / Dashboard
│  │  ├─ movimientos/
│  │  ├─ cuentas/            → cuentas y tarjetas
│  │  ├─ presupuesto/        → placeholder (Fase 2)
│  │  ├─ metas/              → placeholder (Fase 2)
│  │  └─ reportes/           → placeholder (Fase 3)
│  ├─ api/auth/[...nextauth] route handler de Auth.js
│  └─ layout.tsx             fuentes, providers, tema
├─ components/
│  ├─ ui/                    componentes shadcn con tokens Growly
│  └─ growly/                componentes de dominio (BalanceHero, TxRow, AccountCard…)
├─ lib/
│  ├─ prisma.ts              cliente Prisma singleton
│  ├─ auth.ts                config Auth.js
│  ├─ money.ts               helpers de dinero (centavos ↔ display)
│  └─ balances.ts            cálculo de saldos y patrimonio neto
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts                siembra de las 20 categorías del sistema
├─ tests/
├─ middleware.ts             protege el grupo (app)
└─ globals.css               tokens del Design System (CSS variables)
```

## 4. Modelo de datos (Prisma)

Reglas transversales:
- **Dinero** → siempre `Int` en **centavos** (unidad menor), nunca `Float`. Se convierte a
  display en `lib/money.ts`. Cada importe lleva su `currency` (ISO-4217).
- **Saldo de una cuenta** = `initialBalance + Σ(movimientos)`; se **calcula**, no se
  almacena mutado, para garantizar consistencia.
- MVP en una sola moneda de visualización; el campo `currency` existe pero **no hay
  conversión FX** todavía.

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  passwordHash  String?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts      Account[]
  categories    Category[]
  transactions  Transaction[]
  authAccounts  AuthAccount[]   // Auth.js
  sessions      Session[]       // Auth.js
}

// --- Auth.js: AuthAccount, Session, VerificationToken (modelos estándar del adapter) ---

enum AccountType { CHECKING SAVINGS CASH CREDIT_CARD }

model Account {
  id             String      @id @default(cuid())
  userId         String
  name           String
  bankName       String?
  type           AccountType @default(CHECKING)
  currency       String      @default("USD")
  colorHex       String      @default("#10B981")
  icon           String?
  initialBalance Int         @default(0)   // centavos
  archived       Boolean     @default(false)

  // solo si type = CREDIT_CARD
  creditLimit    Int?        // centavos
  statementDay   Int?        // día de corte (1-31)
  dueDay         Int?        // día de pago máximo (1-31)
  apr            Float?      // tasa de interés anual %
  minPayment     Int?        // centavos

  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  user           User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions   Transaction[] @relation("AccountTransactions")
  transfersIn    Transaction[] @relation("TransferAccount")

  @@index([userId])
}

enum CategoryKind { INCOME EXPENSE }

model Category {
  id        String       @id @default(cuid())
  userId    String?      // null = categoría del sistema
  name      String
  icon      String?
  colorHex  String       @default("#8A857E")
  kind      CategoryKind @default(EXPENSE)
  isSystem  Boolean      @default(false)
  createdAt DateTime     @default(now())

  user         User?         @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions Transaction[]

  @@index([userId])
}

enum TransactionType   { INCOME EXPENSE TRANSFER }
enum TransactionStatus { CLEARED PENDING }

model Transaction {
  id                String            @id @default(cuid())
  userId            String
  accountId         String
  categoryId        String?
  type              TransactionType
  amount            Int               // centavos, siempre positivo
  currency          String            @default("USD")
  description       String
  date              DateTime
  status            TransactionStatus @default(CLEARED)
  notes             String?
  transferAccountId String?           // cuenta destino si type = TRANSFER
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt

  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  account         Account   @relation("AccountTransactions", fields: [accountId], references: [id], onDelete: Cascade)
  transferAccount Account?  @relation("TransferAccount", fields: [transferAccountId], references: [id])
  category        Category? @relation(fields: [categoryId], references: [id])

  @@index([userId, date])
  @@index([accountId])
}
```

### Semántica de importes y saldos
- `INCOME` suma al saldo de `account`. `EXPENSE` resta.
- `TRANSFER` resta de `account` y suma a `transferAccount` (mismo importe).
- **Próximos pagos** = transacciones con `date` futura y `status = PENDING`.
- **Tarjeta de crédito**: saldo utilizado = Σ(EXPENSE) − Σ(pagos a la tarjeta);
  disponible = `creditLimit − utilizado`; % utilización para el indicador de riesgo.
- **Patrimonio neto** = Σ(saldos de cuentas no-tarjeta) − Σ(saldos utilizados de tarjetas).

### Categorías sembradas (seed)
Las 20 del documento original: Casa, Alimentación, Transporte, Combustible, Servicios,
Internet, Electricidad, Agua, Teléfono, Streaming, Educación, Salud, Mascotas, Seguros,
Ropa, Entretenimiento, Impuestos, Inversiones, Ahorros, Otros (+ el usuario puede crear
personalizadas). Cada una con `icon` y `colorHex` coherentes con el Design System.

## 5. Rutas y navegación

- **Grupo `(auth)`** (público): `/login`, `/register`, `/forgot-password`.
- **Grupo `(app)`** (protegido por `middleware.ts`): shell con **sidebar** (Inicio,
  Movimientos, Presupuesto, Metas, Cuentas y tarjetas, Reportes + tarjeta Premium + usuario)
  y **topbar** (saludo, buscar, notificaciones, toggle de tema, botón Añadir).
- Rutas activas en el MVP: `/` (Dashboard), `/movimientos`, `/cuentas`.
- `presupuesto`, `metas`, `reportes`: visibles en el nav pero con **placeholder** ("Próximamente").

## 6. Superficie de acciones (Server Actions)

- **Auth:** register, login, logout, requestPasswordReset.
- **Account:** createAccount, updateAccount, archiveAccount (incluye campos de tarjeta).
- **Category:** createCategory, updateCategory, deleteCategory.
- **Transaction:** createTransaction, updateTransaction, deleteTransaction
  (con soporte de `TRANSFER`).

Validación con **Zod** en cada action; revalidación de rutas afectadas tras mutar.

## 7. Auth

Auth.js (NextAuth v5) con:
- **Credentials provider**: email + contraseña con hash **bcrypt**.
- **Google OAuth**.
- Adapter de Prisma; **sesión por JWT** (stateless, sin tabla de sesión en cada request).
- `middleware.ts` redirige a `/login` si no hay sesión en el grupo `(app)`.
- Recuperación de contraseña: genera token, envía enlace (proveedor de correo a definir en
  implementación; en dev puede loguearse el enlace).
- *Fuera del MVP:* Apple, biometría, PIN (son de la fase móvil).

## 8. Design System → código

Se portan **literalmente** las CSS variables de los diseños a `globals.css`:

- **Color:** emerald `#10B981` (acento), `#0A7A5A` (texto verde), `#34D399` (acento en
  oscuro), forest `#12211C`; neutros claro (`#F4F3F0` fondo, `#FFF` superficie, `#1A1A17`
  texto, `#8A857E` suave) y oscuro (`#0A0B0C`, `#141516`, `#F2F2EF`, `#8A8A8C`); semánticos
  éxito `#10B981`, aviso `#E0AD2E`, error `#C9584F`, info `#3B82F6`.
- **Tipografía:** Manrope (400–800) + IBM Plex Mono (números/metadatos). Escala Display 40 /
  Título 27 / Sección 20 / Fila 15 / Cuerpo 14 / Auxiliar 12.
- **Sistema:** espaciado 4pt (4/8/14/20/26); radios 8 (chip) / 15 (botón, input) / 22
  (tarjeta); 3 sombras (sm, lg, glow verde); botón 48px alto, peso 800.
- **Tema claro/oscuro:** estrategia `class` de Tailwind, controlada por el toggle del topbar;
  se reutilizan los nombres de variable de los diseños (`--bg`, `--surface`, `--text`,
  `--acc`, etc.).
- shadcn/ui se configura para consumir estos tokens; los componentes de dominio
  (`BalanceHero`, `TxRow`, `AccountCard`, `CategoryDonut`, `KpiCard`) replican la maqueta.

## 9. Testing (TDD)

- **Unidad (Vitest + RTL):** `lib/money.ts`, `lib/balances.ts` (saldos, patrimonio neto,
  utilización de tarjeta), validaciones Zod, componentes de dominio.
- **e2e (Playwright):** registro → login → crear cuenta → añadir movimiento → ver el
  Dashboard actualizado (saldo, KPIs, donut, próximos pagos, tabla).
- Se sigue el ciclo TDD: test que falla → implementación → verde.

## 10. Fuera de alcance (fases futuras)

| Fase | Contenido |
|---|---|
| 2 · Planificación | Presupuesto (por categoría, predicción), Metas de ahorro, Calendario financiero, motor de recurrencias |
| 3 · Inteligencia | Reportes/Estadísticas avanzadas, Alertas inteligentes, Notificaciones |
| 4 · Escalabilidad | Conectar banco (open banking real), export PDF/Excel, Premium, FX multi-moneda |
| 5 · Móvil | App Flutter reutilizando la misma API |

## 11. Decisiones clave y justificación

1. **Next.js full-stack** en lugar de React SPA + NestJS separado → menos fricción, un solo
   deploy, arranque más rápido; la API sigue siendo consumible por Flutter.
2. **Dinero en centavos (Int)** → exactitud financiera, sin errores de coma flotante.
3. **Saldo calculado, no mutado** → una sola fuente de verdad (los movimientos).
4. **Cuenta y tarjeta unificadas** en un modelo `Account` con `type` y campos de crédito
   opcionales → simplifica el agregado de "Patrimonio neto" que muestra el diseño.
5. **Próximos pagos como movimientos PENDING con fecha futura** → alimenta el Dashboard sin
   construir aún el motor de recurrencias (que llega en Fase 2).
6. **Conectar banco diferido** → el open banking real es costoso y regional; en el MVP la
   entrada es manual.
