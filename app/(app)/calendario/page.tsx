import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getTransactionsForUser } from '@/lib/transactions'
import { getAccountsForUser } from '@/lib/accounts'
import { getCategoriesForUser } from '@/lib/categories'
import { materializeRecurringForUser } from '@/lib/recurring'
import { parseMonthParam, isCurrentMonth } from '@/lib/month-param'
import {
  calendarEvents, calendarMonthTotals, monthGridDays, shortMonthName, type CalTx,
} from '@/lib/calendar'
import { CalendarView } from '@/components/growly/calendar-view'

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { m } = await searchParams
  const now = new Date()
  const ym = parseMonthParam(m, now)

  await materializeRecurringForUser(userId, now)

  const [txns, accounts, categories] = await Promise.all([
    getTransactionsForUser(userId),
    getAccountsForUser(userId),
    getCategoriesForUser(userId),
  ])
  const catById = new Map(categories.map((c) => [c.id, c]))
  const calTxns: CalTx[] = txns.map((t) => {
    const cat = t.categoryId ? catById.get(t.categoryId) : null
    return {
      id: t.id,
      type: t.type,
      amount: t.amount,
      description: t.description,
      date: t.date,
      status: t.status,
      categoryName: cat?.name ?? null,
      categoryIcon: cat?.icon ?? null,
    }
  })

  const events = calendarEvents(calTxns, accounts, ym.year, ym.month)
  const totals = calendarMonthTotals(calTxns, ym.year, ym.month)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Calendario</h1>
      <CalendarView
        ym={ym}
        todayDay={isCurrentMonth(ym, now) ? now.getDate() : null}
        cells={monthGridDays(ym.year, ym.month)}
        eventsByDay={[...events.entries()]}
        totals={totals}
        monthShort={shortMonthName(ym.month)}
      />
    </div>
  )
}
