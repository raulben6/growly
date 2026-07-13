import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GoalsCard } from '@/components/growly/goals-card'

const goals = [
  { id: 'g1', name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6', pct: 48, barPct: 48 },
  { id: 'g2', name: 'Fondo', emoji: '🛡️', colorHex: '#10B981', pct: 105, barPct: 100 },
  { id: 'g3', name: 'Portátil', emoji: '💻', colorHex: '#8B7CF6', pct: 10, barPct: 10 },
]

describe('GoalsCard', () => {
  it('muestra título y hasta 3 metas con emoji, nombre y %', () => {
    render(<GoalsCard goals={goals} />)
    expect(screen.getByText('Metas de ahorro')).toBeInTheDocument()
    expect(screen.getByText('Viaje')).toBeInTheDocument()
    expect(screen.getByText('48%')).toBeInTheDocument()
    expect(screen.getByText('105%')).toBeInTheDocument()
    expect(screen.getByText('✈️')).toBeInTheDocument()
  })
  it('la barra usa el color de la meta y se capa al 100%', () => {
    render(<GoalsCard goals={goals} />)
    const bars = screen.getAllByTestId('goals-card-bar')
    expect(bars[0]).toHaveStyle({ width: '48%', backgroundColor: '#3B82F6' })
    expect(bars[1]).toHaveStyle({ width: '100%', backgroundColor: '#10B981' })
  })
  it('vacío: estado con link a /metas', () => {
    render(<GoalsCard goals={[]} />)
    expect(screen.getByText(/Aún no tienes metas/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Crear meta/i })).toHaveAttribute('href', '/metas')
  })
})
