import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getAccountsWithBalances } from '@/lib/accounts'
import { Money } from '@/components/growly/money'
import { AccountRow } from '@/components/growly/account-row'
import { CreditCardView } from '@/components/growly/credit-card'
import { AccountDialog } from '@/components/growly/account-dialog'

export default async function CuentasPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { accounts, netWorth } = await getAccountsWithBalances(session.user.id)
  const cuentas = accounts.filter((a) => a.type !== 'CREDIT_CARD')
  const tarjetas = accounts.filter((a) => a.type === 'CREDIT_CARD')

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Cuentas y tarjetas</h1>
          <div className="mt-1 text-sm text-muted-foreground">Patrimonio neto</div>
          <Money cents={netWorth} className="text-[34px] font-extrabold tracking-[-0.02em]" />
        </div>
        <AccountDialog />
      </div>

      {accounts.length === 0 && (
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">Aún no tienes cuentas. Añade la primera.</p>
        </div>
      )}

      {cuentas.length > 0 && (
        <>
          <div className="mb-2 mt-4 px-1 text-xs font-extrabold tracking-wide text-muted-foreground">CUENTAS</div>
          <div className="divide-y divide-[var(--line)] rounded-[22px] border border-border bg-card px-5 shadow-[var(--shadow-card)]">
            {cuentas.map((a) => (
              <AccountRow key={a.id} name={a.name} subtitle={a.bankName ?? ''} balance={a.balance} />
            ))}
          </div>
        </>
      )}

      {tarjetas.length > 0 && (
        <>
          <div className="mb-2 mt-6 px-1 text-xs font-extrabold tracking-wide text-muted-foreground">TARJETAS</div>
          <div className="flex flex-col gap-3">
            {tarjetas.map((a) => (
              <CreditCardView
                key={a.id}
                name={a.name}
                used={a.utilization!.used}
                limit={a.creditLimit ?? 0}
                pct={a.utilization!.pct}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
