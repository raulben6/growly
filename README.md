# Growly

**A personal finance app that answers the questions a bank statement never does:** how much can I actually spend today, what's coming out of my account next week, and am I on track this month?

Built as a full product rather than a CRUD demo: accounts, transactions, transfers, envelope budgets, savings goals, recurring rules, a payment calendar and alerts, all behind real authentication and covered by an extensive test suite.

```
Next.js 16 · React 19 · TypeScript · Prisma · PostgreSQL · NextAuth v5 · Tailwind v4 · Zod · Vitest · Playwright
```

---

## The engineering decisions worth reading

This is where most personal-finance projects quietly go wrong, and what this one does instead:

### 💰 Money is stored as integers, never floats

```prisma
model Transaction {
  amount   Int      // minor units (cents), never a Float
  currency String   @default("USD")
}
```

`0.1 + 0.2 !== 0.3` in IEEE 754. In a budgeting app that error compounds across every rollup, so amounts are stored and computed in cents and only formatted for display (`lib/money.ts`). No rounding drift, ever.

### 🔁 Recurring transactions are idempotent by database constraint

A recurring rule (rent, salary, a subscription) has to be *materialized* into real transactions as time passes. Run that job twice and a naive implementation duplicates every payment.

```prisma
model RecurringRule {
  frequency           RecurrenceFrequency
  materializedThrough DateTime?   // how far this rule has been expanded
}

model Transaction {
  recurringRuleId String?
  @@unique([recurringRuleId, date])   // ← duplication is impossible
}
```

The unique constraint makes double-materialization impossible at the storage layer instead of relying on application logic being called exactly once.

### 🔀 Transfers are one transaction, not two

`Transaction.transferAccountId` models an account-to-account move as a single row with a second account reference. Two mirrored rows would let the pair drift apart on edit or partial failure, and would double-count in every report.

### ✅ Validation is defined once and shared

Zod schemas in `lib/validators.ts` are the single source of truth, used by both the client form and the Server Action. A malformed value can't reach the database by skipping the UI.

---

## Features

| Area | What it does |
|---|---|
| **Accounts** | Multiple account types with live computed balances (`lib/balances.ts`) |
| **Transactions** | Income, expense and transfers; pending vs. cleared status; categories and notes |
| **Recurring rules** | Daily to yearly frequencies, optional end date, idempotent materialization |
| **Budgets** | Per-category monthly budgets with progress and overspend detection |
| **Goals** | Savings targets with individual contributions tracked over time |
| **Calendar** | Month view of what is scheduled to hit each account and when |
| **Reports** | Spending breakdowns and month-over-month comparisons |
| **Notifications** | Generated alerts for upcoming payments and budget overruns |
| **Auth** | NextAuth v5, credentials with `bcryptjs` + Google OAuth, Prisma adapter |
| **Theming** | Light and dark mode via `next-themes` |

---

## Architecture

```
app/
  (auth)/          login · register · forgot-password
  (app)/           dashboard · cuentas · movimientos · presupuesto
                   metas · calendario · reportes · notificaciones
  api/auth/        NextAuth route handler

lib/
  *-actions.ts     Server Actions, the only mutation path
  accounts.ts      pure query/derivation layer
  balances.ts      balance computation
  recurrence.ts    frequency math and materialization
  money.ts         integer-cents arithmetic and formatting
  validators.ts    shared Zod schemas
  prisma.ts        singleton Prisma client

prisma/            schema + versioned migrations
tests/             67 Vitest suites (unit + component)
```

**Mutations flow one way:** component → Server Action → Zod validation → Prisma → `revalidatePath`. There is no client-side database access and no parallel REST layer to keep in sync.

---

## Testing

```bash
npm test          # Vitest: 67 suites covering business logic, schemas and components
npm run test:e2e  # Playwright end-to-end flows
```

Coverage is deliberately weighted toward the logic that handles money: balance derivation, recurrence expansion, budget rollups, and validation schemas.

---

## Running it locally

**Requirements:** Node.js 20+, PostgreSQL 14+

```bash
git clone https://github.com/raulben6/growly.git
cd growly
npm install

cp .env.example .env    # DATABASE_URL, AUTH_SECRET, Google OAuth (optional)

npx prisma migrate dev  # apply migrations
npx prisma db seed      # default categories
npm run dev             # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth signing secret. Generate with `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional Google sign-in |
| `NEXT_PUBLIC_GOOGLE_ENABLED` | Toggles the Google button in the UI |

---

## Deployment

Configured for Vercel. The `vercel-build` script runs migrations and seeding before the build:

```bash
prisma generate && prisma migrate deploy && prisma db seed && next build
```

---

## License

[MIT](LICENSE) © Raúl Antonio Benítez Vásquez
