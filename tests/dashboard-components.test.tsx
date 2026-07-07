import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BalanceHero } from '@/components/growly/balance-hero'
import { KpiCard } from '@/components/growly/kpi-card'
import { CategoryDonut } from '@/components/growly/category-donut'

describe('<BalanceHero>', () => {
  it('muestra disponible, total y comprometido', () => {
    render(<BalanceHero disponible={1824000} total={2458000} comprometido={634000} />)
    expect(screen.getByText('Saldo disponible')).toBeInTheDocument()
    expect(screen.getByText('$18,240.00')).toBeInTheDocument()
    expect(screen.getByText('$24,580.00')).toBeInTheDocument()
    expect(screen.getByText('$6,340.00')).toBeInTheDocument()
  })
})

describe('<KpiCard>', () => {
  it('muestra etiqueta e importe', () => {
    render(<KpiCard label="Ingresos" cents={612000} accent="income" subtitle="▲ 8% vs jun" />)
    expect(screen.getByText('Ingresos')).toBeInTheDocument()
    expect(screen.getByText('$6,120.00')).toBeInTheDocument()
    expect(screen.getByText('▲ 8% vs jun')).toBeInTheDocument()
  })
})

describe('<CategoryDonut>', () => {
  it('lista las categorías con su importe', () => {
    render(<CategoryDonut breakdown={[
      { id: 'c1', name: 'Vivienda', colorHex: '#10B981', total: 163000 },
      { id: 'c2', name: 'Comida', colorHex: '#3B82F6', total: 93000 },
    ]} />)
    expect(screen.getByText('Vivienda')).toBeInTheDocument()
    expect(screen.getByText('$1,630.00')).toBeInTheDocument()
    expect(screen.getByText('Comida')).toBeInTheDocument()
  })
  it('muestra estado vacío sin datos', () => {
    render(<CategoryDonut breakdown={[]} />)
    expect(screen.getByText(/Sin gastos/i)).toBeInTheDocument()
  })
})
