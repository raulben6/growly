import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetCard } from '@/components/growly/budget-card'

const summary = {
  totals: { limit: 450_000, spent: 388_000, pct: 86 },
  top: [
    { categoryId: 'c1', name: 'Alimentación', colorHex: '#3B82F6', pct: 93, over: false },
    { categoryId: 'c2', name: 'Transporte', colorHex: '#E0AD2E', pct: 120, over: true },
    { categoryId: 'c3', name: 'Casa', colorHex: '#10B981', pct: 40, over: false },
  ],
}

describe('BudgetCard', () => {
  it('muestra totales, badge de % y top categorías', () => {
    render(<BudgetCard summary={summary} />)
    expect(screen.getByText('Presupuesto')).toBeInTheDocument()
    expect(screen.getByText('86%')).toBeInTheDocument()
    expect(screen.getByText('$3,880')).toBeInTheDocument()
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    expect(screen.getByText('120%')).toBeInTheDocument()
  })

  it('badge ámbar en 85-100, verde debajo, rojo por encima', () => {
    const { rerender } = render(<BudgetCard summary={summary} />)
    expect(screen.getByText('86%').className).toContain('text-warning')
    rerender(<BudgetCard summary={{ ...summary, totals: { ...summary.totals, pct: 45 } }} />)
    expect(screen.getByText('45%').className).toContain('text-acc')
    rerender(<BudgetCard summary={{ ...summary, totals: { ...summary.totals, pct: 120 } }} />)
    expect(screen.getByText('120%', { selector: 'span.rounded-full' }).className).toContain('text-destructive')
  })

  it('categoría excedida en rojo #C9584F', () => {
    render(<BudgetCard summary={summary} />)
    expect(screen.getByText('120%')).toHaveStyle({ color: '#C9584F' })
  })

  it('sin presupuesto: estado vacío con link a /presupuesto', () => {
    render(<BudgetCard summary={null} />)
    expect(screen.getByText(/Sin presupuesto este mes/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Crear presupuesto/i })).toHaveAttribute('href', '/presupuesto')
  })
})
