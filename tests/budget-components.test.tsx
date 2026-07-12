import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MonthNav } from '@/components/growly/month-nav'
import { BudgetHero } from '@/components/growly/budget-hero'
import { BudgetCategoryRow } from '@/components/growly/budget-category-row'

vi.mock('@/lib/budget-actions', () => ({
  upsertBudget: vi.fn(async () => ({ ok: true })),
  deleteBudget: vi.fn(async () => ({ ok: true })),
}))

describe('MonthNav', () => {
  it('muestra la etiqueta y enlaza mes anterior/siguiente cruzando el año', () => {
    render(<MonthNav ym={{ year: 2026, month: 0 }} basePath="/presupuesto" />)
    expect(screen.getByText('Enero 2026')).toBeInTheDocument()
    expect(screen.getByLabelText('Mes anterior')).toHaveAttribute('href', '/presupuesto?m=2025-12')
    expect(screen.getByLabelText('Mes siguiente')).toHaveAttribute('href', '/presupuesto?m=2026-02')
  })
})

describe('BudgetHero', () => {
  const totals = { limit: 450_000, spent: 388_000, pct: 86, available: 62_000 }

  it('muestra gastado, disponible, % y días restantes', () => {
    render(<BudgetHero totals={totals} forecast={{ projected: 434_000, daysLeft: 27 }} />)
    expect(screen.getByText('$3,880')).toBeInTheDocument()
    expect(screen.getByText('86% del presupuesto usado · quedan 27 días')).toBeInTheDocument()
    expect(screen.getByText(/A este ritmo/)).toBeInTheDocument()
  })

  it('sin forecast (mes no actual) no muestra la predicción', () => {
    render(<BudgetHero totals={totals} forecast={null} />)
    expect(screen.getByText('86% del presupuesto usado')).toBeInTheDocument()
    expect(screen.queryByText(/A este ritmo/)).not.toBeInTheDocument()
  })

  it('la barra se capa al 100%', () => {
    render(<BudgetHero totals={{ limit: 100_000, spent: 150_000, pct: 150, available: -50_000 }} forecast={null} />)
    expect(screen.getByTestId('budget-hero-bar')).toHaveStyle({ width: '100%' })
  })
})

describe('BudgetCategoryRow', () => {
  const base = {
    budgetId: 'b1', categoryId: 'c1', name: 'Alimentación', colorHex: '#3B82F6',
    limit: 100_000, spent: 93_000, pct: 93, over: false,
  }

  it('muestra nombre, gastado/límite y barra con el color de la categoría', () => {
    render(<BudgetCategoryRow row={base} year={2026} month={6} />)
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    const bar = screen.getByTestId('budget-row-bar')
    expect(bar).toHaveStyle({ width: '93%', backgroundColor: '#3B82F6' })
  })

  it('excedida: barra al 100% y en rojo #C9584F', () => {
    render(
      <BudgetCategoryRow
        row={{ ...base, spent: 120_000, pct: 120, over: true }}
        year={2026} month={6}
      />,
    )
    const bar = screen.getByTestId('budget-row-bar')
    expect(bar).toHaveStyle({ width: '100%', backgroundColor: '#C9584F' })
  })
})
