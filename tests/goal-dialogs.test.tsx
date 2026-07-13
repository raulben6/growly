import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GoalDialog } from '@/components/growly/goal-dialog'
import { ContributionDialog } from '@/components/growly/contribution-dialog'
import { ContributionsListDialog } from '@/components/growly/contributions-list-dialog'
import { createGoal, updateGoal, addContribution, deleteContribution } from '@/lib/goal-actions'

vi.mock('@/lib/goal-actions', () => ({
  createGoal: vi.fn(async () => ({ ok: true })),
  updateGoal: vi.fn(async () => ({ ok: true })),
  addContribution: vi.fn(async () => ({ ok: true })),
  deleteContribution: vi.fn(async () => ({ ok: true })),
}))

// Reloj fijado: la fecha default del aporte ("hoy") debe ser determinista.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 15))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(() => vi.clearAllMocks())

describe('GoalDialog · crear', () => {
  it('nombre + emoji sugerido + color + objetivo en centavos + sin fecha', async () => {
    const user = userEvent.setup()
    render(<GoalDialog />)
    await user.click(screen.getByRole('button', { name: /Nueva meta/i }))
    await user.type(screen.getByLabelText('Nombre'), 'Viaje a Japón')
    await user.click(screen.getByRole('button', { name: '✈️' }))
    await user.click(screen.getByRole('button', { name: 'Color #3B82F6' }))
    await user.type(screen.getByLabelText('Importe objetivo'), '5000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(createGoal).toHaveBeenCalledWith({
        name: 'Viaje a Japón', emoji: '✈️', colorHex: '#3B82F6',
        targetAmount: 500_000, targetDate: null,
      }),
    )
  })

  it('rechaza objetivo inválido sin llamar a la action', async () => {
    const user = userEvent.setup()
    render(<GoalDialog />)
    await user.click(screen.getByRole('button', { name: /Nueva meta/i }))
    await user.type(screen.getByLabelText('Nombre'), 'X')
    await user.type(screen.getByLabelText('Importe objetivo'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Importe no válido')).toBeInTheDocument()
    expect(createGoal).not.toHaveBeenCalled()
  })
})

describe('GoalDialog · editar', () => {
  const initial = {
    name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6',
    targetAmountStr: '5000.00', targetDate: '2026-12-01',
  }
  it('precarga y llama updateGoal con el id', async () => {
    const user = userEvent.setup()
    render(<GoalDialog goalId="g1" initial={initial} trigger={<button type="button">Editar</button>} />)
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByLabelText('Nombre')).toHaveValue('Viaje')
    expect(screen.getByLabelText('Importe objetivo')).toHaveValue('5000.00')
    expect(screen.getByLabelText('Fecha objetivo')).toHaveValue('2026-12-01')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(updateGoal).toHaveBeenCalledWith('g1', {
        name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6',
        targetAmount: 500_000, targetDate: '2026-12-01',
      }),
    )
  })
})

describe('ContributionDialog', () => {
  it('aporta con fecha default hoy y nota opcional omitida', async () => {
    const user = userEvent.setup()
    render(<ContributionDialog goalId="g1" goalName="Viaje" />)
    await user.click(screen.getByRole('button', { name: /Aportar/i }))
    expect(screen.getByText(/Aportar a Viaje/)).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha')).toHaveValue('2026-07-15')
    await user.type(screen.getByLabelText('Importe'), '2400')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(addContribution).toHaveBeenCalledWith({
        goalId: 'g1', amount: 240_000, date: '2026-07-15', note: undefined,
      }),
    )
  })

  it('muestra el error de la action', async () => {
    vi.mocked(addContribution).mockResolvedValueOnce({ ok: false, error: 'Meta no encontrada' })
    const user = userEvent.setup()
    render(<ContributionDialog goalId="g1" goalName="Viaje" />)
    await user.click(screen.getByRole('button', { name: /Aportar/i }))
    await user.type(screen.getByLabelText('Importe'), '10')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Meta no encontrada')).toBeInTheDocument()
  })
})

describe('ContributionsListDialog', () => {
  const contributions = [
    { id: 'c1', amount: 60_000, dateLabel: '10 jul', note: 'extra' },
    { id: 'c2', amount: 140_000, dateLabel: '20 jun', note: null },
  ]
  it('lista aportes y borra con deleteContribution', async () => {
    const user = userEvent.setup()
    render(
      <ContributionsListDialog goalName="Viaje" contributions={contributions}
        trigger={<button type="button">Ver aportes</button>} />,
    )
    await user.click(screen.getByRole('button', { name: 'Ver aportes' }))
    expect(screen.getByText('10 jul · extra')).toBeInTheDocument()
    expect(screen.getByText('20 jun')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Borrar aporte' })[0])
    await waitFor(() => expect(deleteContribution).toHaveBeenCalledWith('c1'))
  })
})
