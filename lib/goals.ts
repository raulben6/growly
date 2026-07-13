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
