import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BudgetDialog } from '@/components/growly/budget-dialog'
import { upsertBudget } from '@/lib/budget-actions'

vi.mock('@/lib/budget-actions', () => ({
  upsertBudget: vi.fn(async () => ({ ok: true })),
}))

const categories = [
  { id: 'c1', name: 'Alimentación' },
  { id: 'c2', name: 'Transporte' },
]

beforeEach(() => vi.clearAllMocks())

describe('BudgetDialog', () => {
  it('alta: selecciona categoría, escribe importe y llama upsertBudget en centavos', async () => {
    const user = userEvent.setup()
    render(<BudgetDialog year={2026} month={6} categories={categories} />)
    await user.click(screen.getByRole('button', { name: /Añadir categoría/i }))
    await user.selectOptions(screen.getByLabelText('Categoría'), 'c2')
    await user.type(screen.getByLabelText('Límite mensual'), '450.50')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(upsertBudget).toHaveBeenCalledWith({
        categoryId: 'c2', year: 2026, month: 6, amount: 45_050,
      }),
    )
  })

  it('edición: categoría fija, importe precargado', async () => {
    const user = userEvent.setup()
    render(
      <BudgetDialog
        year={2026} month={6} categories={[]}
        initial={{ categoryId: 'c1', categoryName: 'Alimentación', amountStr: '1000.00' }}
        trigger={<button type="button">Editar</button>}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(screen.getByText(/Editar límite · Alimentación/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Límite mensual')).toHaveValue('1000.00')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(upsertBudget).toHaveBeenCalledWith({
        categoryId: 'c1', year: 2026, month: 6, amount: 100_000,
      }),
    )
  })

  it('muestra el error de la action', async () => {
    vi.mocked(upsertBudget).mockResolvedValueOnce({ ok: false, error: 'Categoría no válida' })
    const user = userEvent.setup()
    render(<BudgetDialog year={2026} month={6} categories={categories} />)
    await user.click(screen.getByRole('button', { name: /Añadir categoría/i }))
    await user.type(screen.getByLabelText('Límite mensual'), '100')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Categoría no válida')).toBeInTheDocument()
  })

  it('rechaza importe inválido sin llamar a la action', async () => {
    const user = userEvent.setup()
    render(<BudgetDialog year={2026} month={6} categories={categories} />)
    await user.click(screen.getByRole('button', { name: /Añadir categoría/i }))
    await user.type(screen.getByLabelText('Límite mensual'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Importe no válido')).toBeInTheDocument()
    expect(upsertBudget).not.toHaveBeenCalled()
  })
})
