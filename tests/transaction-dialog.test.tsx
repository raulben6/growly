import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/transaction-actions', () => ({ createTransaction: vi.fn(async () => ({ ok: true })) }))
import { TransactionDialog } from '@/components/growly/transaction-dialog'
import { createTransaction } from '@/lib/transaction-actions'

const accounts = [{ id: 'a1', name: 'Corriente' }, { id: 'a2', name: 'Ahorros' }]
const categories = [
  { id: 'c1', name: 'Comida', kind: 'EXPENSE' as const },
  { id: 'c2', name: 'Nómina', kind: 'INCOME' as const },
]

beforeEach(() => { vi.mocked(createTransaction).mockClear() })

describe('<TransactionDialog>', () => {
  it('abre con campos de gasto por defecto', async () => {
    render(<TransactionDialog accounts={accounts} categories={categories} />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir/i }))
    expect(await screen.findByLabelText('Importe')).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument()
    expect(screen.getByLabelText('Categoría')).toBeInTheDocument()
    expect(screen.getByLabelText('Cuenta')).toBeInTheDocument()
  })

  it('en Transferencia muestra cuenta origen y destino, sin categoría', async () => {
    render(<TransactionDialog accounts={accounts} categories={categories} />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Transferencia' }))
    expect(screen.getByLabelText('Cuenta origen')).toBeInTheDocument()
    expect(screen.getByLabelText('Cuenta destino')).toBeInTheDocument()
    expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument()
  })

  it('envía un gasto con el payload correcto (amount en centavos)', async () => {
    render(<TransactionDialog accounts={accounts} categories={categories} />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir/i }))
    await userEvent.type(await screen.findByLabelText('Importe'), '62.30')
    await userEvent.type(screen.getByLabelText('Descripción'), 'Mercadona')
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-07-06' } })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EXPENSE', amount: 6230, description: 'Mercadona', date: '2026-07-06',
          currency: 'USD', accountId: 'a1', categoryId: 'c1', transferAccountId: null,
        }),
      ),
    )
  })

  it('envía una transferencia (categoryId null, transferAccountId puesto)', async () => {
    render(<TransactionDialog accounts={accounts} categories={categories} />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir/i }))
    await userEvent.click(await screen.findByRole('button', { name: 'Transferencia' }))
    await userEvent.type(screen.getByLabelText('Importe'), '100')
    await userEvent.type(screen.getByLabelText('Descripción'), 'Traspaso')
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-07-06' } })
    await userEvent.selectOptions(screen.getByLabelText('Cuenta destino'), 'a2')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() =>
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TRANSFER', amount: 10000, accountId: 'a1', transferAccountId: 'a2', categoryId: null,
        }),
      ),
    )
  })
})
