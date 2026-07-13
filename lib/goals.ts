import { prisma } from '@/lib/prisma'

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
