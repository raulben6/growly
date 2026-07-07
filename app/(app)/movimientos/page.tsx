import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getTransactionsForUser, groupTransactionsByDay } from '@/lib/transactions'
import { getAccountsForUser } from '@/lib/accounts'
import { getCategoriesForUser } from '@/lib/categories'
import { TransactionRow } from '@/components/growly/transaction-row'
import { TransactionDialog } from '@/components/growly/transaction-dialog'

const FILTERS = [
  { key: undefined, label: 'Todos', href: '/movimientos' },
  { key: 'INCOME' as const, label: 'Ingresos', href: '/movimientos?tipo=ingresos' },
  { key: 'EXPENSE' as const, label: 'Gastos', href: '/movimientos?tipo=gastos' },
]

export default async function MovimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { tipo } = await searchParams
  const kind = tipo === 'ingresos' ? 'INCOME' : tipo === 'gastos' ? 'EXPENSE' : undefined

  const [txns, accounts, categories] = await Promise.all([
    getTransactionsForUser(userId, kind ? { kind } : {}),
    getAccountsForUser(userId),
    getCategoriesForUser(userId),
  ])
  const catById = new Map(categories.map((c) => [c.id, c]))
  const groups = groupTransactionsByDay(txns, new Date())

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Movimientos</h1>
        <TransactionDialog
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
        />
      </div>

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
                return (
                  <TransactionRow
                    key={t.id}
                    description={t.description}
                    meta={`${kindLabel} · ${time}`}
                    signedCents={signed}
                    iconName={cat?.icon ?? 'ellipsis'}
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
