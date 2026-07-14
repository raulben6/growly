import { describe, it, expect } from 'vitest'
import {
  monthlySeries, reportKpis, kpiDeltas, categoryTotalsForRange, linePoints,
  type ReportTx, type MonthPoint,
} from '@/lib/reports'

const tx = (over: Partial<ReportTx>): ReportTx => ({
  type: 'EXPENSE', amount: 10_000, date: new Date(Date.UTC(2026, 6, 10)),
  status: 'CLEARED', categoryId: 'c1', ...over,
})

describe('monthlySeries', () => {
  it('ventana de 6 meses cruzando el año, meses vacíos en 0', () => {
    // "hoy" = 15 feb 2027 → ventana sep 2026..feb 2027
    const series = monthlySeries(
      [
        tx({ type: 'INCOME', amount: 100_000, date: new Date(Date.UTC(2026, 8, 5)) }),
        tx({ amount: 40_000, date: new Date(Date.UTC(2027, 1, 1)) }), // día 1 UTC → feb
        tx({ amount: 99_000, date: new Date(Date.UTC(2026, 7, 30)) }), // ago: fuera
      ],
      new Date(2027, 1, 15), 6,
    )
    expect(series.map((p) => [p.year, p.month])).toEqual([
      [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2027, 0], [2027, 1],
    ])
    expect(series[0]).toMatchObject({ income: 100_000, expense: 0 })
    expect(series[5]).toMatchObject({ income: 0, expense: 40_000 })
    expect(series[2]).toMatchObject({ income: 0, expense: 0 })
  })

  it('ignora PENDING y TRANSFER', () => {
    const series = monthlySeries(
      [
        tx({ status: 'PENDING', amount: 50_000 }),
        tx({ type: 'TRANSFER', amount: 70_000 }),
        tx({ amount: 30_000 }),
      ],
      new Date(2026, 6, 15), 6,
    )
    expect(series[5]).toMatchObject({ income: 0, expense: 30_000 })
  })
})

describe('reportKpis', () => {
  it('tasa y gasto medio/día con deltas vs mes anterior', () => {
    const series: MonthPoint[] = [
      { year: 2026, month: 5, income: 300_000, expense: 189_000 }, // jun: tasa 37, media 6300 (30 días)
      { year: 2026, month: 6, income: 300_000, expense: 90_000 },  // jul: tasa 70, media 7500 (día 12)
    ]
    expect(reportKpis(series, new Date(2026, 6, 12))).toEqual({
      savingsRate: 70,
      savingsRateDelta: 33,
      avgDailyExpense: 7_500,
      avgDailyExpenseDelta: 1_200,
    })
  })

  it('mes anterior vacío → deltas null', () => {
    const series: MonthPoint[] = [
      { year: 2026, month: 5, income: 0, expense: 0 },
      { year: 2026, month: 6, income: 200_000, expense: 60_000 },
    ]
    expect(reportKpis(series, new Date(2026, 6, 10))).toEqual({
      savingsRate: 70,
      savingsRateDelta: null,
      avgDailyExpense: 6_000,
      avgDailyExpenseDelta: null,
    })
  })
})

describe('kpiDeltas', () => {
  it('variación porcentual vs mes anterior', () => {
    expect(kpiDeltas([
      { year: 2026, month: 5, income: 300_000, expense: 100_000 },
      { year: 2026, month: 6, income: 330_000, expense: 90_000 },
    ])).toEqual({ incomePct: 10, expensePct: -10 })
  })
  it('previo en 0 → null', () => {
    expect(kpiDeltas([
      { year: 2026, month: 5, income: 0, expense: 100_000 },
      { year: 2026, month: 6, income: 330_000, expense: 0 },
    ])).toEqual({ incomePct: null, expensePct: -100 })
  })
})

describe('categoryTotalsForRange', () => {
  const cats = [
    { id: 'c1', name: 'Comida', colorHex: '#3B82F6' },
    { id: 'c2', name: 'Casa', colorHex: '#10B981' },
  ]
  it('rango inclusive, orden desc y Otros para sin categoría', () => {
    const top = categoryTotalsForRange(
      [
        tx({ amount: 30_000, date: new Date(Date.UTC(2026, 1, 1)) }),  // feb: borde inferior
        tx({ amount: 63_000, date: new Date(Date.UTC(2026, 6, 31)) }), // jul: borde superior
        tx({ categoryId: 'c2', amount: 160_000, date: new Date(Date.UTC(2026, 4, 10)) }),
        tx({ categoryId: null, amount: 5_000, date: new Date(Date.UTC(2026, 3, 2)) }),
        tx({ amount: 99_000, date: new Date(Date.UTC(2026, 0, 31)) }), // ene: fuera
        tx({ type: 'INCOME', amount: 500_000, date: new Date(Date.UTC(2026, 4, 1)) }),
        tx({ status: 'PENDING', amount: 77_000, date: new Date(Date.UTC(2026, 4, 2)) }),
      ],
      cats,
      { year: 2026, month: 1 },
      { year: 2026, month: 6 },
    )
    expect(top.map((c) => [c.name, c.total])).toEqual([
      ['Casa', 160_000], ['Comida', 93_000], ['Otros', 5_000],
    ])
    expect(top[2].colorHex).toBe('#8A857E')
  })
})

describe('linePoints', () => {
  it('escala con margen superior del 10%', () => {
    expect(linePoints([0, 50, 100], 640, 200, 100)).toBe('0,200 320,110 640,20')
  })
  it('vacío o max 0 → cadena vacía', () => {
    expect(linePoints([], 640, 200, 100)).toBe('')
    expect(linePoints([1, 2], 640, 200, 0)).toBe('')
  })
})
