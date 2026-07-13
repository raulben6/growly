import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GoalsHero } from '@/components/growly/goals-hero'
import { GoalCard } from '@/components/growly/goal-card'

vi.mock('@/lib/goal-actions', () => ({
  createGoal: vi.fn(), updateGoal: vi.fn(), archiveGoal: vi.fn(),
  addContribution: vi.fn(), deleteContribution: vi.fn(),
}))

describe('GoalsHero', () => {
  it('muestra total, plural y ahorro del mes', () => {
    render(<GoalsHero totalSaved={1_130_000} activeCount={3} savedThisMonth={62_000} />)
    expect(screen.getByText('Total ahorrado en metas')).toBeInTheDocument()
    expect(screen.getByText('$11,300')).toBeInTheDocument()
    expect(screen.getByText(/3 metas activas/)).toBeInTheDocument()
  })
  it('singular con una meta', () => {
    render(<GoalsHero totalSaved={0} activeCount={1} savedThisMonth={0} />)
    expect(screen.getByText(/1 meta activa ·/)).toBeInTheDocument()
  })
})

const baseGoal = {
  id: 'g1', name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6',
  targetAmount: 500_000, saved: 240_000, pct: 48, barPct: 48, completed: false,
  dateLabel: 'Meta · dic 2026',
  initial: { name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6', targetAmountStr: '5000.00', targetDate: '2026-12-01' },
  contributions: [],
}

describe('GoalCard', () => {
  it('muestra nombre, subtítulo, ahorrado/objetivo, % y barra con el color', () => {
    render(<GoalCard goal={baseGoal} />)
    expect(screen.getByText('Viaje')).toBeInTheDocument()
    expect(screen.getByText('Meta · dic 2026')).toBeInTheDocument()
    expect(screen.getByText('$2,400')).toBeInTheDocument()
    expect(screen.getByText('48% completado')).toBeInTheDocument()
    expect(screen.getByTestId('goal-bar')).toHaveStyle({ width: '48%', backgroundColor: '#3B82F6' })
    expect(screen.queryByText('¡Completada!')).not.toBeInTheDocument()
  })
  it('completada: badge y barra verde capada al 100%', () => {
    render(
      <GoalCard goal={{ ...baseGoal, saved: 525_000, pct: 105, barPct: 100, completed: true }} />,
    )
    expect(screen.getByText('¡Completada!')).toBeInTheDocument()
    expect(screen.getByText('105% completado')).toBeInTheDocument()
    expect(screen.getByTestId('goal-bar')).toHaveStyle({ width: '100%', backgroundColor: '#10B981' })
  })
  it('acciones accesibles: aportar, ver aportes, editar y archivar', () => {
    render(<GoalCard goal={baseGoal} />)
    expect(screen.getByRole('button', { name: /Aportar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver aportes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Archivar' })).toBeInTheDocument()
  })
})
