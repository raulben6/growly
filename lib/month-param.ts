// Convención: en URL el mes es humano 1-12 ("2026-07" = julio); en código y DB es 0-11.
// Esta es la ÚNICA frontera donde se convierte. Compartido por /presupuesto y (C4) /calendario.

export type YearMonth = { year: number; month: number } // month 0-11

export function parseMonthParam(m: string | undefined, now: Date): YearMonth {
  const match = m ? /^(\d{4})-(\d{2})$/.exec(m) : null
  if (match) {
    const year = Number(match[1])
    const human = Number(match[2])
    if (human >= 1 && human <= 12) return { year, month: human - 1 }
  }
  return { year: now.getFullYear(), month: now.getMonth() }
}

export function monthParam({ year, month }: YearMonth): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export function monthLabel({ year, month }: YearMonth): string {
  return `${MESES[month]} ${year}`
}

export function prevMonth({ year, month }: YearMonth): YearMonth {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
}

export function nextMonth({ year, month }: YearMonth): YearMonth {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
}

export function isCurrentMonth({ year, month }: YearMonth, now: Date): boolean {
  return year === now.getFullYear() && month === now.getMonth()
}
