export type RecurrenceFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY'

export type RecurrenceRuleInput = {
  frequency: RecurrenceFrequency
  startDate: Date
  endDate?: Date | null
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const daysInMonthUTC = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

export function addDaysUTC(d: Date, days: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + days)
  return r
}

export function formatShortDateUTC(d: Date): string {
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

// n-ésima ocurrencia de la serie (n = 0 es startDate). Anclada a startDate:
// MONTHLY/YEARLY con ajuste de fin de mes (día 31 → 30/28/29, nunca se desliza de mes).
export function occurrenceAt(rule: RecurrenceRuleInput, n: number): Date {
  const s = rule.startDate
  switch (rule.frequency) {
    case 'WEEKLY':
      return addDaysUTC(s, 7 * n)
    case 'BIWEEKLY':
      return addDaysUTC(s, 14 * n)
    case 'MONTHLY': {
      const months = s.getUTCMonth() + n
      const y = s.getUTCFullYear() + Math.floor(months / 12)
      const m = ((months % 12) + 12) % 12
      const r = new Date(s)
      r.setUTCFullYear(y, m, Math.min(s.getUTCDate(), daysInMonthUTC(y, m)))
      return r
    }
    case 'YEARLY': {
      const y = s.getUTCFullYear() + n
      const r = new Date(s)
      r.setUTCFullYear(y, s.getUTCMonth(), Math.min(s.getUTCDate(), daysInMonthUTC(y, s.getUTCMonth())))
      return r
    }
  }
}

// Ocurrencias con fromExclusive < fecha <= min(toInclusive, endDate).
export function nextOccurrences(rule: RecurrenceRuleInput, fromExclusive: Date, toInclusive: Date): Date[] {
  const endMs = rule.endDate
    ? Math.min(rule.endDate.getTime(), toInclusive.getTime())
    : toInclusive.getTime()
  const out: Date[] = []
  for (let n = 0; ; n++) {
    const d = occurrenceAt(rule, n)
    if (d.getTime() > endMs) break
    if (d.getTime() > fromExclusive.getTime()) out.push(d)
  }
  return out
}

// Primera ocurrencia estrictamente futura, o null si la serie terminó.
export function nextDateForRule(rule: RecurrenceRuleInput, now: Date): Date | null {
  for (let n = 0; ; n++) {
    const d = occurrenceAt(rule, n)
    if (rule.endDate && d.getTime() > rule.endDate.getTime()) return null
    if (d.getTime() > now.getTime()) return d
  }
}

export function describeFrequency(rule: Pick<RecurrenceRuleInput, 'frequency' | 'startDate'>): string {
  const s = rule.startDate
  switch (rule.frequency) {
    case 'WEEKLY':
      return `Cada semana · ${DIAS[s.getUTCDay()]}`
    case 'BIWEEKLY':
      return `Cada 2 semanas · ${DIAS[s.getUTCDay()]}`
    case 'MONTHLY':
      return `Cada mes · día ${s.getUTCDate()}`
    case 'YEARLY':
      return `Cada año · ${s.getUTCDate()} ${MESES[s.getUTCMonth()]}`
  }
}
