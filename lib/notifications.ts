import { prisma } from '@/lib/prisma'
import { alertCandidates, type AlertCandidate, type AlertInput } from '@/lib/alerts'
import { getBudgetsForMonth, budgetProgress } from '@/lib/budgets'
import { getTransactionsForUser } from '@/lib/transactions'
import { getAccountsWithBalances } from '@/lib/accounts'

// Inserta candidatas de forma idempotente: unique [userId, dedupeKey] + skipDuplicates
// (patrón materialize/auto-copia). Cada condición notifica UNA sola vez.
export async function persistAlertCandidates(userId: string, candidates: AlertCandidate[]) {
  if (candidates.length === 0) return
  await prisma.notification.createMany({
    data: candidates.map((c) => ({ ...c, userId })),
    skipDuplicates: true,
  })
}

// Evaluación autónoma (la usa /notificaciones). El dashboard NO la usa: construye el
// input con los datos que ya tiene cargados y llama persistAlertCandidates directo.
export async function evaluateAlertsForUser(userId: string, now: Date = new Date()) {
  const [budgets, txns, { accounts }] = await Promise.all([
    getBudgetsForMonth(userId, now.getFullYear(), now.getMonth(), now),
    getTransactionsForUser(userId),
    getAccountsWithBalances(userId),
  ])
  const progress = budgetProgress(budgets, txns, now.getFullYear(), now.getMonth())
  const input: AlertInput = {
    budget: budgets.length > 0 ? progress.totals : null,
    pendingTxns: txns
      .filter((t) => t.status === 'PENDING')
      .map((t) => ({ id: t.id, description: t.description, amount: t.amount, date: t.date })),
    cards: accounts
      .filter((a) => a.type === 'CREDIT_CARD')
      .map((a) => ({ id: a.id, name: a.name, dueDay: a.dueDay, used: a.utilization?.used ?? 0 })),
  }
  await persistAlertCandidates(userId, alertCandidates(input, now))
}

export function getNotificationsForUser(userId: string, opts: { unreadOnly?: boolean } = {}) {
  return prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
  })
}

export function getUnreadCountForUser(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } })
}

export async function markNotificationReadForUser(userId: string, id: string, now: Date = new Date()) {
  const res = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: now },
  })
  return { ok: res.count > 0 }
}

export async function markAllNotificationsReadForUser(userId: string, now: Date = new Date()) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: now },
  })
  return { ok: true as const }
}
