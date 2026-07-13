import { describe, it, expect } from 'vitest'
import { budgetProgress, budgetForecast } from '@/lib/budgets'

const budgets = [
  { id: 'b1', categoryId: 'comida', amount: 100_000 },
  { id: 'b2', categoryId: 'transporte', amount: 50_000 },
]

const tx = (over: Partial<Parameters<typeof budgetProgress>[1][number]>) => ({
  type: 'EXPENSE' as const,
  amount: 10_000,
  date: new Date(2026, 6, 10),
  categoryId: 'comida',
  status: 'CLEARED' as const,
  ...over,
})

describe('budgetProgress', () => {
  it('acumula el gasto CLEARED del mes por categoría', () => {
    const { categories, totals } = budgetProgress(
      budgets,
      [tx({ amount: 30_000 }), tx({ amount: 63_000, date: new Date(2026, 6, 20) })],
      2026, 6,
    )
    const comida = categories.find((c) => c.categoryId === 'comida')!
    expect(comida).toMatchObject({ budgetId: 'b1', limit: 100_000, spent: 93_000, pct: 93, over: false })
    expect(totals).toEqual({ limit: 150_000, spent: 93_000, pct: 62, available: 57_000 })
  })

  it('marca excedido y permite pct > 100 y available negativo', () => {
    const { categories, totals } = budgetProgress(
      budgets,
      [tx({ categoryId: 'transporte', amount: 60_000 }), tx({ amount: 93_000 })],
      2026, 6,
    )
    const transporte = categories.find((c) => c.categoryId === 'transporte')!
    expect(transporte).toMatchObject({ spent: 60_000, pct: 120, over: true })
    expect(totals).toEqual({ limit: 150_000, spent: 153_000, pct: 102, available: -3_000 })
  })

  it('ordena las categorías por pct descendente', () => {
    const { categories } = budgetProgress(
      budgets,
      [tx({ categoryId: 'transporte', amount: 60_000 }), tx({ amount: 20_000 })],
      2026, 6,
    )
    expect(categories.map((c) => c.categoryId)).toEqual(['transporte', 'comida'])
  })

  it('sin gasto: spent 0, pct 0, over false', () => {
    const { categories, totals } = budgetProgress(budgets, [], 2026, 6)
    expect(categories.every((c) => c.spent === 0 && c.pct === 0 && !c.over)).toBe(true)
    expect(totals).toEqual({ limit: 150_000, spent: 0, pct: 0, available: 150_000 })
  })

  it('ignora PENDING, otros meses, INCOME/TRANSFER, sin categoría y categorías no presupuestadas', () => {
    const { totals } = budgetProgress(
      budgets,
      [
        tx({ status: 'PENDING', amount: 40_000 }),
        tx({ date: new Date(2026, 5, 30), amount: 99_000 }),
        tx({ type: 'INCOME', amount: 500_000 }),
        tx({ type: 'TRANSFER', amount: 70_000 }),
        tx({ categoryId: null, amount: 12_000 }),
        tx({ categoryId: 'ropa-sin-presupuesto', amount: 20_000 }),
      ],
      2026, 6,
    )
    expect(totals.spent).toBe(0)
  })

  it('sin budgets: totales a cero', () => {
    const { categories, totals } = budgetProgress([], [tx({})], 2026, 6)
    expect(categories).toEqual([])
    expect(totals).toEqual({ limit: 0, spent: 0, pct: 0, available: 0 })
  })

  it('gasto del día 1 a medianoche UTC cuenta en el mes (convención UTC)', () => {
    const { totals } = budgetProgress(
      budgets,
      [tx({ date: new Date(Date.UTC(2026, 6, 1)), amount: 10_000 })],
      2026, 6,
    )
    expect(totals.spent).toBe(10_000)
  })
})

describe('budgetForecast', () => {
  it('proyección run-rate a mitad de mes', () => {
    // 4 jul 2026 (31 días): 40_000 / 4 × 31 = 310_000; quedan 27 días
    expect(budgetForecast({ spent: 40_000 }, new Date(2026, 6, 4)))
      .toEqual({ projected: 310_000, daysLeft: 27 })
  })

  it('día 1 sin gasto: proyección 0', () => {
    expect(budgetForecast({ spent: 0 }, new Date(2026, 6, 1)))
      .toEqual({ projected: 0, daysLeft: 30 })
  })
})
