# Growly Fase 0 — Fundaciones · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar en pie una app Next.js con los tokens del Design System de Growly, la capa de datos (Prisma + PostgreSQL con schema y seed), autenticación (email+contraseña y Google) y el shell protegido (sidebar + topbar + tema claro/oscuro) — sin features financieras todavía.

**Architecture:** Next.js 16 App Router full-stack. Lectura en Server Components con Prisma; mutaciones en Server Actions validadas con Zod. Auth.js v5 con adapter de Prisma protege el grupo de rutas `(app)` vía `middleware.ts`. Los tokens de los diseños de Claude Design se portan literalmente a `globals.css` y alimentan shadcn/ui.

**Tech Stack:** Next.js 16, React 19, TypeScript, TailwindCSS v4, shadcn/ui, Prisma, PostgreSQL (Neon), Auth.js v5 (`next-auth@beta`), bcryptjs, Zod, Vitest + React Testing Library, Playwright.

## Global Constraints

- **Dinero:** nunca se toca en Fase 0, pero cuando se defina, siempre `Int` en centavos. (Aplica en Fase 1.)
- **Idioma de la UI:** español. Textos exactos según los diseños (p. ej. nav: `Inicio`, `Movimientos`, `Presupuesto`, `Metas`, `Cuentas y tarjetas`, `Reportes`).
- **Marca:** logo = cuadrado `#10B981` con el trazo `M4 19 L10 12 L14 15 L20 6`. Wordmark `Growly`, peso 800.
- **Tokens de color (verbatim):** acento emerald `#10B981`; verde texto `#0A7A5A`; acento oscuro `#34D399`; forest `#12211C`; claro → fondo `#F4F3F0`, superficie `#FFFFFF`, texto `#1A1A17`, suave `#8A857E`; oscuro → fondo `#0A0B0C`, superficie `#141516`, texto `#F2F2EF`, suave `#8A8A8C`; semánticos → éxito `#10B981`, aviso `#E0AD2E`, error `#C9584F`, info `#3B82F6`.
- **Tipografía:** Manrope (400–800) sans; IBM Plex Mono (400,500) para números/metadatos.
- **Radios:** chip 8px, botón/input 15px (usaremos `--radius: 0.9375rem`), tarjeta 22px. **Botón:** alto 48px, peso 800.
- **Tema:** estrategia por clase `.dark` (toggle en el topbar), no `prefers-color-scheme`.
- **Auth:** sesión por **JWT**. Contraseñas con **bcrypt**. Recuperación: en dev se loguea el enlace por consola.
- **Commits:** frecuentes, uno por tarea como mínimo. Mensajes en español, estilo `feat:`/`chore:`/`test:`.
- **Node:** 20+ (idealmente 24 LTS).

---

## Estructura de archivos (Fase 0)

```
growly/
├─ app/
│  ├─ layout.tsx                    root: fuentes + <html> + ThemeProvider
│  ├─ globals.css                   tokens del Design System + shadcn vars
│  ├─ (auth)/
│  │  ├─ layout.tsx                 layout centrado para auth
│  │  ├─ login/page.tsx
│  │  ├─ register/page.tsx
│  │  └─ forgot-password/page.tsx
│  ├─ (app)/
│  │  ├─ layout.tsx                 shell protegido (sidebar+topbar)
│  │  ├─ page.tsx                   Inicio (placeholder Fase 0)
│  │  ├─ movimientos/page.tsx       placeholder
│  │  ├─ cuentas/page.tsx           placeholder
│  │  ├─ presupuesto/page.tsx       placeholder
│  │  ├─ metas/page.tsx             placeholder
│  │  └─ reportes/page.tsx          placeholder
│  └─ api/auth/[...nextauth]/route.ts
├─ components/
│  ├─ ui/                           shadcn (button, input, label, card…)
│  └─ growly/
│     ├─ logo.tsx                   LogoMark + Wordmark
│     ├─ sidebar.tsx
│     ├─ topbar.tsx
│     ├─ theme-toggle.tsx
│     └─ nav-items.ts               lista de navegación (single source)
├─ lib/
│  ├─ prisma.ts                     singleton PrismaClient
│  ├─ auth.ts                       config Auth.js (authConfig + handlers)
│  ├─ auth-actions.ts               server actions: register, requestPasswordReset
│  └─ validators.ts                 esquemas Zod (registerSchema, loginSchema)
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts                       20 categorías del sistema
├─ tests/
│  ├─ setup.ts                      setup de Vitest + RTL
│  └─ e2e/auth.spec.ts              Playwright
├─ middleware.ts
├─ components.json                  config shadcn
├─ vitest.config.ts
├─ playwright.config.ts
├─ .env                            DATABASE_URL, AUTH_SECRET, GOOGLE_*
└─ .env.example
```

---

### Task 1: Scaffold del proyecto Next.js

**Files:**
- Create: todo el árbol base vía `create-next-app`
- Modify: `package.json` (scripts)
- Test: `tests/smoke.test.tsx`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: proyecto Next.js ejecutable con `npm run dev`; Vitest configurado con `npm test`.

- [ ] **Step 1: Crear el proyecto**

En `C:\Growly` (que ya tiene git, docs y el .md original), scaffoldea dentro del directorio actual:

```bash
npx create-next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --use-npm --yes
```

Si `create-next-app` se queja de que el directorio no está vacío, mueve temporalmente `docs/` y `Proyecto_Aplicacion_Finanzas_Personales.md`, scaffoldea, y devuélvelos.

- [ ] **Step 2: Instalar dependencias de test**

```bash
npm i -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 3: Configurar Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['**/node_modules/**', '**/tests/e2e/**'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Escribir el smoke test (debe fallar)**

Create `tests/smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

function Hello() {
  return <h1>Growly</h1>
}

describe('smoke', () => {
  it('renderiza texto', () => {
    render(<Hello />)
    expect(screen.getByText('Growly')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Ejecutar el test**

Run: `npm test`
Expected: PASS (1 test). Si falla el entorno jsdom, revisa `vitest.config.ts`.

- [ ] **Step 6: Verificar que la app arranca**

Run: `npm run build`
Expected: build exitoso sin errores de TypeScript.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + Vitest"
```

---

### Task 2: Tokens del Design System + fuentes + tema + primitivo Button

**Files:**
- Create: `components.json` (shadcn), `components/ui/button.tsx`, `components/growly/logo.tsx`
- Modify: `app/globals.css`, `app/layout.tsx`
- Test: `tests/button.test.tsx`

**Interfaces:**
- Consumes: proyecto de Task 1.
- Produces: clases de tema disponibles (`.dark`), `<Button variant="…">` de shadcn temado con Growly, `<LogoMark/>` y `<Wordmark/>`.

- [ ] **Step 1: Inicializar shadcn e instalar primitivos**

```bash
npx shadcn@latest init --yes
npx shadcn@latest add button input label card --yes
```

(Sigue la skill `vercel:shadcn` si la sintaxis del CLI cambió. Al terminar existe `components/ui/button.tsx`.)

- [ ] **Step 2: Portar los tokens a `app/globals.css`**

Reemplaza el bloque `:root`/`.dark` generado por shadcn con los valores de Growly. Mantén los **nombres de variable que shadcn espera** (`--background`, `--foreground`, `--primary`, etc.) y añade tokens extra de Growly. En Tailwind v4 el tema se declara con `@theme` y una variante dark por clase:

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

:root {
  /* superficies y texto (claro) */
  --background: #f4f3f0;
  --foreground: #1a1a17;
  --card: #ffffff;
  --card-foreground: #1a1a17;
  --popover: #ffffff;
  --popover-foreground: #1a1a17;
  --muted: #f2f0ea;
  --muted-foreground: #8a857e;
  --border: rgba(0,0,0,0.06);
  --input: rgba(0,0,0,0.10);
  --ring: #10b981;
  /* marca / acción */
  --primary: #10b981;
  --primary-foreground: #062e22;
  --secondary: #ffffff;
  --secondary-foreground: #1a1a17;
  --destructive: #c9584f;
  --destructive-foreground: #ffffff;
  /* tokens propios de Growly */
  --acc: #0a7a5a;
  --forest: #12211c;
  --field: #faf8f4;
  --track: #eeece6;
  --success: #10b981;
  --warning: #e0ad2e;
  --info: #3b82f6;
  --radius: 0.9375rem; /* 15px botón/input */
}

.dark {
  --background: #0a0b0c;
  --foreground: #f2f2ef;
  --card: #141516;
  --card-foreground: #f2f2ef;
  --popover: #141516;
  --popover-foreground: #f2f2ef;
  --muted: #1e1f21;
  --muted-foreground: #8a8a8c;
  --border: rgba(255,255,255,0.08);
  --input: rgba(255,255,255,0.12);
  --ring: #34d399;
  --primary: #10b981;
  --primary-foreground: #062e22;
  --secondary: #141516;
  --secondary-foreground: #f2f2ef;
  --acc: #34d399;
  --forest: #12211c;
  --field: #1b1c1d;
  --track: #26282a;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-acc: var(--acc);
  --color-forest: var(--forest);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);
  --radius-sm: 0.5rem;   /* 8 chip */
  --radius-md: 0.9375rem;/* 15 botón */
  --radius-lg: 1.375rem; /* 22 tarjeta */
  --font-sans: var(--font-manrope);
  --font-mono: var(--font-plex-mono);
  --shadow-card: 0 4px 14px -9px rgba(0,0,0,.2);
  --shadow-elev: 0 14px 30px -12px rgba(18,33,28,.4);
  --shadow-glow: 0 10px 22px -6px rgba(16,185,129,.6);
}

body { background: var(--background); color: var(--foreground); }
```

- [ ] **Step 3: Cargar las fuentes en `app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Manrope, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const manrope = Manrope({ subsets: ['latin'], weight: ['400','500','600','700','800'], variable: '--font-manrope' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400','500'], variable: '--font-plex-mono' })

export const metadata: Metadata = { title: 'Growly', description: 'Tus finanzas, en orden' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${manrope.variable} ${plexMono.variable} font-sans antialiased`}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: Crear el logo `components/growly/logo.tsx`**

```tsx
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-[10px] bg-primary"
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none"
        stroke="#062e22" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19 L10 12 L14 15 L20 6" />
      </svg>
    </div>
  )
}

export function Wordmark() {
  return <span className="text-xl font-extrabold tracking-[-0.01em] text-foreground">Growly</span>
}
```

- [ ] **Step 5: Escribir el test del Button temado (debe fallar si no está temado)**

Create `tests/button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Button } from '@/components/ui/button'
import { LogoMark, Wordmark } from '@/components/growly/logo'

describe('primitivos de UI', () => {
  it('Button primario usa el color de marca', () => {
    render(<Button>Añadir</Button>)
    const btn = screen.getByRole('button', { name: 'Añadir' })
    expect(btn.className).toContain('bg-primary')
  })
  it('Wordmark muestra Growly', () => {
    render(<><LogoMark /><Wordmark /></>)
    expect(screen.getByText('Growly')).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Ejecutar y ajustar**

Run: `npm test`
Expected: PASS. Si el `Button` de shadcn no incluye `bg-primary` en la variante default, verifica que `components/ui/button.tsx` conserva `bg-primary` (así viene por defecto en shadcn).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: tokens del design system, fuentes, tema y logo"
```

---

### Task 3: Capa de datos — Prisma + schema + migración

**Files:**
- Create: `prisma/schema.prisma`, `lib/prisma.ts`, `.env`, `.env.example`
- Test: `tests/prisma-client.test.ts`

**Interfaces:**
- Consumes: nada del código previo.
- Produces: `prisma` (cliente singleton exportado de `@/lib/prisma`); tablas `User`, `Account`, `Category`, `Transaction` + modelos de Auth.js en la base de datos.

- [ ] **Step 1: Instalar Prisma**

```bash
npm i -D prisma
npm i @prisma/client
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Configurar la base de datos (Neon)**

Crea una base gratis en Neon (o Postgres local con Docker) y pon la cadena en `.env`:

```
DATABASE_URL="postgresql://USER:PASS@HOST/growly?sslmode=require"
AUTH_SECRET="genera-uno-con: npx auth secret"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
```

Copia las claves (sin valores) a `.env.example`.

- [ ] **Step 3: Escribir `prisma/schema.prisma`**

Pega el schema exacto de la spec (§4), incluyendo los modelos de Auth.js requeridos por el adapter:

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
  authAccounts  AuthAccount[]
  sessions      Session[]
}

model AuthAccount {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

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
  initialBalance Int         @default(0)
  archived       Boolean     @default(false)
  creditLimit    Int?
  statementDay   Int?
  dueDay         Int?
  apr            Float?
  minPayment     Int?
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
  userId    String?
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
  amount            Int
  currency          String            @default("USD")
  description       String
  date              DateTime
  status            TransactionStatus @default(CLEARED)
  notes             String?
  transferAccountId String?
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

- [ ] **Step 4: Crear el cliente singleton `lib/prisma.ts`**

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 5: Migrar**

```bash
npx prisma migrate dev --name init
```

Expected: crea la migración y las tablas; `npx prisma generate` corre solo.

- [ ] **Step 6: Test de conexión (integración)**

Create `tests/prisma-client.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe('prisma', () => {
  it('conecta y cuenta usuarios', async () => {
    const count = await prisma.user.count()
    expect(typeof count).toBe('number')
  })
})
```

Run: `npm test -- tests/prisma-client.test.ts`
Expected: PASS (requiere `DATABASE_URL` accesible). Si no hay DB en el entorno de test, marca este test con `describe.skipIf(!process.env.DATABASE_URL)`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: schema Prisma + cliente y migración inicial"
```

---

### Task 4: Seed de categorías del sistema

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (bloque `prisma.seed`)
- Test: `tests/seed.test.ts`

**Interfaces:**
- Consumes: `prisma` de `@/lib/prisma`, modelos de Task 3.
- Produces: 20 categorías con `isSystem = true`, `userId = null` en la base.

- [ ] **Step 1: Escribir `prisma/seed.ts`**

```ts
import { PrismaClient, CategoryKind } from '@prisma/client'
const prisma = new PrismaClient()

const SYSTEM_CATEGORIES: { name: string; icon: string; colorHex: string; kind: CategoryKind }[] = [
  { name: 'Casa',          icon: 'home',      colorHex: '#10B981', kind: 'EXPENSE' },
  { name: 'Alimentación',  icon: 'utensils',  colorHex: '#3B82F6', kind: 'EXPENSE' },
  { name: 'Transporte',    icon: 'car',       colorHex: '#E0AD2E', kind: 'EXPENSE' },
  { name: 'Combustible',   icon: 'fuel',      colorHex: '#C9584F', kind: 'EXPENSE' },
  { name: 'Servicios',     icon: 'plug',      colorHex: '#8B7CF6', kind: 'EXPENSE' },
  { name: 'Internet',      icon: 'wifi',      colorHex: '#3B82F6', kind: 'EXPENSE' },
  { name: 'Electricidad',  icon: 'zap',       colorHex: '#E0AD2E', kind: 'EXPENSE' },
  { name: 'Agua',          icon: 'droplet',   colorHex: '#3B82F6', kind: 'EXPENSE' },
  { name: 'Teléfono',      icon: 'phone',     colorHex: '#10B981', kind: 'EXPENSE' },
  { name: 'Streaming',     icon: 'play',      colorHex: '#C9584F', kind: 'EXPENSE' },
  { name: 'Educación',     icon: 'book',      colorHex: '#3B82F6', kind: 'EXPENSE' },
  { name: 'Salud',         icon: 'heart',     colorHex: '#C9584F', kind: 'EXPENSE' },
  { name: 'Mascotas',      icon: 'paw',       colorHex: '#E0AD2E', kind: 'EXPENSE' },
  { name: 'Seguros',       icon: 'shield',    colorHex: '#8B7CF6', kind: 'EXPENSE' },
  { name: 'Ropa',          icon: 'shirt',     colorHex: '#3B82F6', kind: 'EXPENSE' },
  { name: 'Entretenimiento', icon: 'ticket',  colorHex: '#C9584F', kind: 'EXPENSE' },
  { name: 'Impuestos',     icon: 'landmark',  colorHex: '#8A857E', kind: 'EXPENSE' },
  { name: 'Inversiones',   icon: 'trending-up', colorHex: '#10B981', kind: 'INCOME' },
  { name: 'Ahorros',       icon: 'piggy-bank', colorHex: '#10B981', kind: 'EXPENSE' },
  { name: 'Otros',         icon: 'ellipsis',  colorHex: '#8A857E', kind: 'EXPENSE' },
]

async function main() {
  for (const c of SYSTEM_CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { name: c.name, isSystem: true, userId: null } })
    if (!existing) await prisma.category.create({ data: { ...c, isSystem: true } })
  }
  console.log(`Seed listo: ${SYSTEM_CATEGORIES.length} categorías del sistema.`)
}

main().finally(() => prisma.$disconnect())
```

- [ ] **Step 2: Registrar el seed en `package.json`**

Añade a nivel raíz:

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

Instala el runner: `npm i -D tsx`

- [ ] **Step 3: Ejecutar el seed**

```bash
npx prisma db seed
```

Expected: imprime "Seed listo: 20 categorías del sistema."

- [ ] **Step 4: Test del seed (idempotencia)**

Create `tests/seed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('seed', () => {
  it('hay exactamente 20 categorías del sistema', async () => {
    const count = await prisma.category.count({ where: { isSystem: true, userId: null } })
    expect(count).toBe(20)
  })
})
```

Run: `npm test -- tests/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: seed de 20 categorías del sistema"
```

---

### Task 5: Backend de autenticación (Auth.js + registro)

**Files:**
- Create: `lib/auth.ts`, `lib/validators.ts`, `lib/auth-actions.ts`, `app/api/auth/[...nextauth]/route.ts`, `middleware.ts`
- Test: `tests/auth-actions.test.ts`

**Interfaces:**
- Consumes: `prisma`, modelos de Task 3.
- Produces:
  - `auth`, `handlers`, `signIn`, `signOut` exportados de `@/lib/auth`.
  - `registerSchema`, `loginSchema` (Zod) de `@/lib/validators`.
  - `registerUser(input: { name: string; email: string; password: string }): Promise<{ ok: true } | { ok: false; error: string }>` de `@/lib/auth-actions`.

- [ ] **Step 1: Instalar dependencias**

```bash
npm i next-auth@beta @auth/prisma-adapter bcryptjs zod
npm i -D @types/bcryptjs
```

- [ ] **Step 2: Validadores `lib/validators.ts`**

```ts
import { z } from 'zod'

export const registerSchema = z.object({
  name: z.string().min(2, 'Nombre demasiado corto'),
  email: z.string().email('Correo no válido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

export const loginSchema = z.object({
  email: z.string().email('Correo no válido'),
  password: z.string().min(1, 'Introduce tu contraseña'),
})
```

- [ ] **Step 3: Config de Auth.js `lib/auth.ts`**

```ts
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import Google from 'next-auth/providers/google'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { loginSchema } from '@/lib/validators'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Google,
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = loginSchema.safeParse(raw)
        if (!parsed.success) return null
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
        if (!user?.passwordHash) return null
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!ok) return null
        return { id: user.id, name: user.name, email: user.email, image: user.image }
      },
    }),
  ],
})
```

- [ ] **Step 4: Route handler `app/api/auth/[...nextauth]/route.ts`**

```ts
import { handlers } from '@/lib/auth'
export const { GET, POST } = handlers
```

- [ ] **Step 5: Middleware `middleware.ts`**

```ts
import { auth } from '@/lib/auth'

export default auth((req) => {
  const isAuthed = !!req.auth
  const onAuthPage = ['/login', '/register', '/forgot-password'].some((p) =>
    req.nextUrl.pathname.startsWith(p))
  if (!isAuthed && !onAuthPage) {
    return Response.redirect(new URL('/login', req.nextUrl))
  }
  if (isAuthed && onAuthPage) {
    return Response.redirect(new URL('/', req.nextUrl))
  }
})

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] }
```

- [ ] **Step 6: Escribir el test del registro (debe fallar)**

Create `tests/auth-actions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from '@/lib/prisma'
import { registerUser } from '@/lib/auth-actions'
import bcrypt from 'bcryptjs'

const email = `test_${Date.now()}@growly.app`

describe.skipIf(!process.env.DATABASE_URL)('registerUser', () => {
  beforeEach(async () => { await prisma.user.deleteMany({ where: { email } }) })

  it('crea el usuario con la contraseña hasheada', async () => {
    const res = await registerUser({ name: 'Test User', email, password: 'supersecret' })
    expect(res.ok).toBe(true)
    const user = await prisma.user.findUnique({ where: { email } })
    expect(user).not.toBeNull()
    expect(user!.passwordHash).not.toBe('supersecret')
    expect(await bcrypt.compare('supersecret', user!.passwordHash!)).toBe(true)
  })

  it('rechaza email duplicado', async () => {
    await registerUser({ name: 'Test User', email, password: 'supersecret' })
    const res = await registerUser({ name: 'Otro', email, password: 'supersecret' })
    expect(res.ok).toBe(false)
  })

  it('rechaza contraseña corta', async () => {
    const res = await registerUser({ name: 'X', email: `x_${Date.now()}@g.app`, password: '123' })
    expect(res.ok).toBe(false)
  })
})
```

- [ ] **Step 7: Ejecutar y ver fallar**

Run: `npm test -- tests/auth-actions.test.ts`
Expected: FAIL con "registerUser is not a function / cannot find module".

- [ ] **Step 8: Implementar `lib/auth-actions.ts`**

```ts
'use server'

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { registerSchema } from '@/lib/validators'

export async function registerUser(input: { name: string; email: string; password: string }) {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const { name, email, password } = parsed.data
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { ok: false as const, error: 'Ese correo ya está registrado' }
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.create({ data: { name, email, passwordHash } })
  return { ok: true as const }
}

export async function requestPasswordReset(email: string) {
  // En dev: se registra el enlace por consola. Proveedor de correo real en fase posterior.
  const user = await prisma.user.findUnique({ where: { email } })
  if (user) console.log(`[reset] enlace para ${email}: /reset?token=DEV_TOKEN`)
  return { ok: true as const } // no revela si el correo existe
}
```

- [ ] **Step 9: Ejecutar y ver pasar**

Run: `npm test -- tests/auth-actions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: auth backend (Auth.js, registro, middleware)"
```

---

### Task 6: Pantallas de autenticación (Entrada)

**Files:**
- Create: `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/(auth)/forgot-password/page.tsx`
- Test: `tests/e2e/auth.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: `registerUser`, `requestPasswordReset` de `@/lib/auth-actions`; `signIn` de `@/lib/auth`; `<Button>`, `<Input>`, `<Label>`; `<LogoMark/>`.
- Produces: rutas `/login`, `/register`, `/forgot-password` funcionales según el diseño "Entrada".

- [ ] **Step 1: Layout de auth `app/(auth)/layout.tsx`**

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-5">
      <div className="w-full max-w-[400px]">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Registro `app/(auth)/register/page.tsx`**

Formulario con Nombre / Correo / Contraseña + checkbox de términos, botón "Crear cuenta". Client component que llama a `registerUser` y, si `ok`, hace `signIn('credentials', …)` y redirige a `/`.

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { registerUser } from '@/lib/auth-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogoMark } from '@/components/growly/logo'

export default function RegisterPage() {
  const router = useRouter()
  const [state, setState] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const res = await registerUser(state)
    if (!res.ok) { setError(res.error); setLoading(false); return }
    await signIn('credentials', { email: state.email, password: state.password, redirect: false })
    router.push('/')
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="mb-3"><LogoMark size={52} /></div>
      <h1 className="text-[27px] font-extrabold tracking-[-0.02em]">Crea tu cuenta</h1>
      <p className="text-sm text-muted-foreground mb-3">Empieza a ordenar tus finanzas hoy</p>
      <div><Label htmlFor="name">Nombre completo</Label>
        <Input id="name" value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} /></div>
      <div><Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" type="email" value={state.email} onChange={(e) => setState({ ...state, email: e.target.value })} /></div>
      <div><Label htmlFor="password">Contraseña</Label>
        <Input id="password" type="password" value={state.password} onChange={(e) => setState({ ...state, password: e.target.value })} /></div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="h-12 font-extrabold mt-2">Crear cuenta</Button>
    </form>
  )
}
```

- [ ] **Step 3: Login `app/(auth)/login/page.tsx`**

Igual estructura con Correo / Contraseña, enlace "¿Olvidaste tu contraseña?" a `/forgot-password`, botón "Entrar" (llama `signIn('credentials', { redirect:false })` y redirige a `/` si no hay error; muestra "Correo o contraseña incorrectos" si falla), separador "o continúa con" y botón "Google" (`signIn('google')`). Link a `/register`.

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { LogoMark } from '@/components/growly/logo'

export default function LoginPage() {
  const router = useRouter()
  const [state, setState] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    const res = await signIn('credentials', { ...state, redirect: false })
    if (res?.error) { setError('Correo o contraseña incorrectos'); setLoading(false); return }
    router.push('/')
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="mb-3"><LogoMark size={52} /></div>
      <h1 className="text-[27px] font-extrabold tracking-[-0.02em]">Bienvenido de nuevo</h1>
      <p className="text-sm text-muted-foreground mb-3">Inicia sesión para continuar</p>
      <div><Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" type="email" value={state.email} onChange={(e) => setState({ ...state, email: e.target.value })} /></div>
      <div><Label htmlFor="password">Contraseña</Label>
        <Input id="password" type="password" value={state.password} onChange={(e) => setState({ ...state, password: e.target.value })} /></div>
      <Link href="/forgot-password" className="text-right text-sm font-bold text-acc">¿Olvidaste tu contraseña?</Link>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="h-12 font-extrabold">Entrar</Button>
      <Button type="button" variant="secondary" className="h-12" onClick={() => signIn('google', { callbackUrl: '/' })}>Google</Button>
      <p className="text-center text-sm text-muted-foreground">¿No tienes cuenta? <Link href="/register" className="text-acc font-bold">Regístrate</Link></p>
    </form>
  )
}
```

- [ ] **Step 4: Recuperar `app/(auth)/forgot-password/page.tsx`**

Campo Correo + botón "Enviar enlace" que llama `requestPasswordReset(email)` y muestra un mensaje de confirmación neutro. Link "Inicia sesión" a `/login`.

```tsx
'use client'
import { useState } from 'react'
import { requestPasswordReset } from '@/lib/auth-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  async function onSubmit(e: React.FormEvent) { e.preventDefault(); await requestPasswordReset(email); setSent(true) }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h1 className="text-[27px] font-extrabold tracking-[-0.02em]">¿Olvidaste tu contraseña?</h1>
      <p className="text-sm text-muted-foreground mb-3">Ingresa tu correo y te enviaremos un enlace para restablecerla.</p>
      <div><Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {sent && <p className="text-sm text-success">Si el correo existe, te enviamos un enlace.</p>}
      <Button type="submit" className="h-12 font-extrabold">Enviar enlace</Button>
      <p className="text-center text-sm"><Link href="/login" className="text-acc font-bold">Inicia sesión</Link></p>
    </form>
  )
}
```

- [ ] **Step 5: Configurar Playwright**

```bash
npm i -D @playwright/test
npx playwright install chromium
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
})
```

Add script: `"test:e2e": "playwright test"`.

- [ ] **Step 6: Escribir el e2e de registro→login**

Create `tests/e2e/auth.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('registro redirige al dashboard', async ({ page }) => {
  const email = `e2e_${Date.now()}@growly.app`
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E User')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')
})
```

- [ ] **Step 7: Ejecutar el e2e**

Run: `npm run test:e2e`
Expected: PASS (requiere `DATABASE_URL` y `AUTH_SECRET`). El middleware debe permitir llegar a `/` tras autenticar.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: pantallas de login, registro y recuperar contraseña"
```

---

### Task 7: Shell de la app (sidebar + topbar + tema)

**Files:**
- Create: `components/growly/nav-items.ts`, `components/growly/sidebar.tsx`, `components/growly/topbar.tsx`, `components/growly/theme-toggle.tsx`, `app/(app)/layout.tsx`
- Modify: `app/layout.tsx` (envolver en ThemeProvider)
- Test: `tests/sidebar.test.tsx`, `tests/theme-toggle.test.tsx`

**Interfaces:**
- Consumes: `auth` de `@/lib/auth`; `<LogoMark/>`, `<Wordmark/>`.
- Produces: `NAV_ITEMS` (array `{ href, label, icon }`); shell que envuelve todas las rutas de `(app)`.

- [ ] **Step 1: Instalar utilidades de tema e iconos**

```bash
npm i next-themes lucide-react
```

- [ ] **Step 2: ThemeProvider en el root layout**

Crea `components/growly/theme-provider.tsx`:

```tsx
'use client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>{children}</NextThemesProvider>
}
```

Envuelve `{children}` con `<ThemeProvider>` en `app/layout.tsx` (dentro de `<body>`).

- [ ] **Step 3: Definir la navegación `components/growly/nav-items.ts`**

```ts
import { Home, ArrowUpDown, PieChart, Target, CreditCard, BarChart3, type LucideIcon } from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { href: '/',            label: 'Inicio',             icon: Home },
  { href: '/movimientos', label: 'Movimientos',        icon: ArrowUpDown },
  { href: '/presupuesto', label: 'Presupuesto',        icon: PieChart },
  { href: '/metas',       label: 'Metas',              icon: Target },
  { href: '/cuentas',     label: 'Cuentas y tarjetas', icon: CreditCard },
  { href: '/reportes',    label: 'Reportes',           icon: BarChart3 },
]
```

- [ ] **Step 4: Sidebar `components/growly/sidebar.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from './nav-items'
import { LogoMark, Wordmark } from './logo'

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card min-h-screen p-4 flex flex-col gap-1">
      <div className="flex items-center gap-3 px-2 mb-6 mt-2"><LogoMark /><Wordmark /></div>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link key={href} href={href}
            className={`flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-sm font-semibold ${
              active ? 'bg-forest text-white' : 'text-muted-foreground hover:bg-muted'}`}>
            <Icon size={20} className={active ? 'text-primary' : ''} />
            {label}
          </Link>
        )
      })}
    </aside>
  )
}
```

- [ ] **Step 5: Theme toggle `components/growly/theme-toggle.tsx`**

```tsx
'use client'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <button aria-label="Cambiar tema" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-11 h-11 rounded-xl border border-border bg-card flex items-center justify-center">
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  )
}
```

- [ ] **Step 6: Topbar `components/growly/topbar.tsx`**

```tsx
import { ThemeToggle } from './theme-toggle'
import { Bell, Plus } from 'lucide-react'

export function Topbar({ userName }: { userName: string }) {
  return (
    <header className="flex items-center justify-between mb-6">
      <div>
        <div className="text-sm text-muted-foreground font-semibold">Hoy</div>
        <div className="text-2xl font-extrabold tracking-[-0.02em]">Hola, {userName}</div>
      </div>
      <div className="flex items-center gap-3.5">
        <button aria-label="Notificaciones" className="w-11 h-11 rounded-xl border border-border bg-card flex items-center justify-center"><Bell size={20} /></button>
        <ThemeToggle />
        <button className="h-11 px-4 rounded-xl bg-primary text-primary-foreground font-extrabold flex items-center gap-2"><Plus size={18} /> Añadir</button>
      </div>
    </header>
  )
}
```

- [ ] **Step 7: Layout protegido `app/(app)/layout.tsx`**

```tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/growly/sidebar'
import { Topbar } from '@/components/growly/topbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 px-8 py-6">
        <Topbar userName={session.user.name?.split(' ')[0] ?? 'usuario'} />
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 8: Escribir los tests (deben fallar)**

Create `tests/sidebar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Sidebar } from '@/components/growly/sidebar'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

describe('Sidebar', () => {
  it('muestra los 6 items de navegación', () => {
    render(<Sidebar />)
    for (const label of ['Inicio','Movimientos','Presupuesto','Metas','Cuentas y tarjetas','Reportes']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
```

Create `tests/theme-toggle.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ThemeToggle } from '@/components/growly/theme-toggle'

const setTheme = vi.fn()
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme }) }))

describe('ThemeToggle', () => {
  it('cambia a oscuro al hacer clic', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByLabelText('Cambiar tema'))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })
})
```

- [ ] **Step 9: Ejecutar los tests**

Run: `npm test -- tests/sidebar.test.tsx tests/theme-toggle.test.tsx`
Expected: PASS (2 archivos).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: shell de la app (sidebar, topbar, toggle de tema)"
```

---

### Task 8: Rutas placeholder de la app

**Files:**
- Create: `app/(app)/page.tsx`, `app/(app)/movimientos/page.tsx`, `app/(app)/cuentas/page.tsx`, `app/(app)/presupuesto/page.tsx`, `app/(app)/metas/page.tsx`, `app/(app)/reportes/page.tsx`, `components/growly/coming-soon.tsx`
- Test: `tests/coming-soon.test.tsx`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: las 6 rutas del nav renderizan; las 4 aún-no-implementadas muestran `<ComingSoon/>`.

- [ ] **Step 1: Componente `components/growly/coming-soon.tsx`**

```tsx
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
      <h1 className="text-xl font-extrabold mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground">Próximamente en una siguiente fase.</p>
    </div>
  )
}
```

- [ ] **Step 2: Página Inicio `app/(app)/page.tsx`** (placeholder de Fase 0; se reemplaza en Fase 1)

```tsx
export default function DashboardPage() {
  return (
    <div className="rounded-[22px] border border-border bg-card p-10 shadow-[var(--shadow-card)]">
      <h1 className="text-xl font-extrabold mb-2">Inicio</h1>
      <p className="text-sm text-muted-foreground">El dashboard financiero llega en la Fase 1.</p>
    </div>
  )
}
```

- [ ] **Step 3: Las 4 placeholder + cuentas/movimientos**

Cada archivo (`presupuesto`, `metas`, `reportes`) exporta `<ComingSoon title="…" />` con su título. Ejemplo `app/(app)/presupuesto/page.tsx`:

```tsx
import { ComingSoon } from '@/components/growly/coming-soon'
export default function Page() { return <ComingSoon title="Presupuesto" /> }
```

Repite para `metas` (`title="Metas"`) y `reportes` (`title="Reportes"`). Para `movimientos` y `cuentas`, usa también `<ComingSoon>` en Fase 0 (`title="Movimientos"` / `title="Cuentas y tarjetas"`); se reemplazan en Fase 1.

- [ ] **Step 4: Test del placeholder**

Create `tests/coming-soon.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ComingSoon } from '@/components/growly/coming-soon'

describe('ComingSoon', () => {
  it('muestra el título y el aviso', () => {
    render(<ComingSoon title="Metas" />)
    expect(screen.getByText('Metas')).toBeInTheDocument()
    expect(screen.getByText(/Próximamente/)).toBeInTheDocument()
  })
})
```

Run: `npm test -- tests/coming-soon.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verificación manual del flujo completo**

Run: `npm run dev`. Sin sesión, ir a `/` redirige a `/login`. Regístrate → aterrizas en el shell con sidebar+topbar. Navega por los 6 items. Alterna el tema con el toggle (claro/oscuro). Compara contra el diseño `Growly Web`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: rutas de la app con placeholders (Fase 0 completa)"
```

---

## Self-Review (cobertura vs. spec)

- **Stack (spec §2):** Next.js/TS/Tailwind/shadcn/Prisma/Postgres/Auth.js/Vitest/Playwright → Tasks 1–7. ✅
- **Estructura (spec §3):** árbol de archivos → mapeado arriba y en Tasks 1–8. ✅
- **Modelo de datos (spec §4):** schema completo → Task 3; seed 20 categorías → Task 4. ✅ (CRUD y `lib/money`/`lib/balances` son de **Fase 1**, fuera de este plan.)
- **Rutas y navegación (spec §5):** grupos `(auth)`/`(app)`, middleware, 6 items de nav, placeholders → Tasks 5–8. ✅
- **Auth (spec §7):** Credentials+Google, bcrypt, JWT, middleware, recuperación dev → Tasks 5–6. ✅
- **Design System (spec §8):** tokens verbatim, Manrope+Plex Mono, radios/sombras, tema por clase → Task 2. ✅
- **Testing (spec §9):** Vitest+RTL en cada tarea; Playwright del flujo de auth → Task 6. El e2e completo "añadir movimiento → dashboard" es de Fase 1. ✅

**Notas de ejecución:** los tests que tocan la base (`describe.skipIf(!process.env.DATABASE_URL)`) requieren `DATABASE_URL` y `AUTH_SECRET` en el entorno. Para la sintaxis exacta y actual de shadcn (Tailwind v4) y Auth.js v5, seguir las skills `vercel:shadcn` y la doc de Auth.js durante la ejecución.

**Fuera de alcance (van en el Plan B — Fase 1):** `lib/money.ts`, `lib/balances.ts`, CRUD de Categorías/Cuentas/Tarjetas/Movimientos, y el Dashboard real con sus tarjetas, donut, próximos pagos y tabla.
