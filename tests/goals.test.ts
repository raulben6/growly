import { describe, it, expect } from 'vitest'
import { goalProgress, goalTotals, goalDateLabel } from '@/lib/goals'

describe('goalProgress', () => {
  it('progreso normal: 48%', () => {
    expect(goalProgress({ targetAmount: 500_000 }, 240_000))
      .toEqual({ pct: 48, barPct: 48, completed: false })
  })
  it('exactamente el objetivo: 100% y completada', () => {
    expect(goalProgress({ targetAmount: 500_000 }, 500_000))
      .toEqual({ pct: 100, barPct: 100, completed: true })
  })
  it('sobre-ahorro: pct real > 100, barra capada', () => {
    expect(goalProgress({ targetAmount: 500_000 }, 525_000))
      .toEqual({ pct: 105, barPct: 100, completed: true })
  })
  it('sin aportes: 0%', () => {
    expect(goalProgress({ targetAmount: 500_000 }, 0))
      .toEqual({ pct: 0, barPct: 0, completed: false })
  })
  it('target 0 (defensivo): 0% y no completada', () => {
    expect(goalProgress({ targetAmount: 0 }, 100))
      .toEqual({ pct: 0, barPct: 0, completed: false })
  })
})

describe('goalTotals', () => {
  const now = new Date(2026, 6, 15) // 15 jul 2026
  it('suma total y filtra el mes actual (fechas de datos UTC vs now local)', () => {
    const contributions = [
      { amount: 60_000, date: new Date(Date.UTC(2026, 6, 10)) },
      { amount: 40_000, date: new Date(Date.UTC(2026, 6, 1)) },
      { amount: 140_000, date: new Date(Date.UTC(2026, 5, 20)) }, // junio: no cuenta este mes
      { amount: 10_000, date: new Date(Date.UTC(2025, 6, 10)) },  // julio de OTRO año: no cuenta
    ]
    expect(goalTotals(contributions, now)).toEqual({ saved: 250_000, savedThisMonth: 100_000 })
  })
  it('sin aportes: ceros', () => {
    expect(goalTotals([], now)).toEqual({ saved: 0, savedThisMonth: 0 })
  })

  it('aporte del día 1 a medianoche UTC cuenta en el mes (convención UTC)', () => {
    expect(goalTotals([{ amount: 5_000, date: new Date(Date.UTC(2026, 6, 1)) }], now))
      .toEqual({ saved: 5_000, savedThisMonth: 5_000 })
  })
})

describe('goalDateLabel', () => {
  it('con fecha: mes corto UTC + año', () => {
    expect(goalDateLabel(new Date(Date.UTC(2026, 11, 1)))).toBe('Meta · dic 2026')
    expect(goalDateLabel(new Date(Date.UTC(2027, 0, 31)))).toBe('Meta · ene 2027')
  })
  it('sin fecha', () => {
    expect(goalDateLabel(null)).toBe('Meta · sin fecha')
  })
})
