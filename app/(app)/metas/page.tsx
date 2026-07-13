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
