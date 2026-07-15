import { formatMoney } from '@/lib/money'
import { daysInMonth } from '@/lib/calendar'
import { monthParam, type YearMonth } from '@/lib/month-param'

export type AlertType = 'BUDGET_WARN' | 'BUDGET_OVER' | 'PAYMENT_DUE' | 'PAYMENT_OVERDUE' | 'CARD_DUE'

export type AlertCandidate = { type: AlertType; title: string; body: string; dedupeKey: string }

export type AlertInput = {
  // totales del presupuesto del mes actual (budgetProgress.totals), o null si no hay presupuesto
  budget: { pct: number; spent: number; limit: number } | null
  // movimientos PENDING (date = fecha-calendario a medianoche UTC)
  pendingTxns: { id: string; description: string; amount: number; date: Date }[]
  // tarjetas de crédito activas con su saldo usado
  cards: { id: string; name: string; dueDay: number | null; used: number }[]
}

const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DAY_MS = 86_400_000

// Próximo vencimiento de una tarjeta: el dueDay de este mes (ajustado al último día si no
// existe) o, si ya pasó respecto al día de calendario local de hoy, el del mes siguiente.
export function nextCardDueDate(dueDay: number, now: Date): { year: number; month: number; day: number } {
  let year = now.getFullYear()
  let month = now.getMonth()
  let day = Math.min(dueDay, daysInMonth(year, month))
  if (day < now.getDate()) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
    day = Math.min(dueDay, daysInMonth(year, month))
  }
  return { year, month, day }
}

// Reglas de la spec §5.1. Los copys se congelan al crear la notificación.
export function alertCandidates(input: AlertInput, now: Date): AlertCandidate[] {
  const out: AlertCandidate[] = []
  const ym: YearMonth = { year: now.getFullYear(), month: now.getMonth() }
  const monthKey = monthParam(ym)
  const mes = MESES_LARGOS[ym.month]

  if (input.budget) {
    const { pct, spent, limit } = input.budget
    if (pct >= 85 && pct <= 100) {
      out.push({
        type: 'BUDGET_WARN',
        title: 'Cerca del límite de presupuesto',
        body: `Llevas el ${pct}% de tu presupuesto de ${mes}.`,
        dedupeKey: `budget-85-${monthKey}`,
      })
    }
    if (pct > 100) {
      out.push({
        type: 'BUDGET_OVER',
        title: `Presupuesto de ${mes} superado`,
        body: `Llevas el ${pct}% del límite (${formatMoney(spent, { withCents: false })} de ${formatMoney(limit, { withCents: false })}).`,
        dedupeKey: `budget-over-${monthKey}`,
      })
    }
  }

  for (const t of input.pendingTxns) {
    const diff = t.date.getTime() - now.getTime()
    if (diff <= 0) {
      out.push({
        type: 'PAYMENT_OVERDUE',
        title: 'Pago vencido',
        body: `${t.description} (${formatMoney(t.amount)}) está pendiente de confirmar.`,
        dedupeKey: `tx-overdue-${t.id}`,
      })
    } else if (diff <= 3 * DAY_MS) {
      const n = Math.ceil(diff / DAY_MS)
      out.push({
        type: 'PAYMENT_DUE',
        title: 'Pago próximo',
        body: `${t.description} (${formatMoney(t.amount)}) vence en ${n} ${n === 1 ? 'día' : 'días'}.`,
        dedupeKey: `tx-due-${t.id}`,
      })
    }
  }

  for (const c of input.cards) {
    if (!c.dueDay || c.used <= 0) continue
    const due = nextCardDueDate(c.dueDay, now)
    // días entre el día de calendario local de hoy y el del vencimiento (aritmética UTC exacta)
    const daysUntil = Math.round(
      (Date.UTC(due.year, due.month, due.day) - Date.UTC(ym.year, ym.month, now.getDate())) / DAY_MS,
    )
    if (daysUntil <= 5) {
      out.push({
        type: 'CARD_DUE',
        title: 'Pago de tarjeta próximo',
        body: `El pago de ${c.name} (${formatMoney(c.used, { withCents: false })}) vence el ${due.day} de ${MESES_LARGOS[due.month]}.`,
        dedupeKey: `card-due-${c.id}-${monthParam({ year: due.year, month: due.month })}`,
      })
    }
  }

  return out
}

// createdAt es un INSTANTE real (no fecha-calendario) → getters LOCALES para mostrar.
export function relativeTimeLabel(date: Date, now: Date): string {
  const diff = now.getTime() - date.getTime()
  if (diff < 60_000) return 'Ahora'
  if (diff < 3_600_000) return `Hace ${Math.floor(diff / 60_000)} min`
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return `Hace ${Math.floor(diff / 3_600_000)} h`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  if (isYesterday) return 'Ayer'
  return `${date.getDate()} ${MESES_CORTOS[date.getMonth()]}`
}
