import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/transaction-actions', () => ({ createTransaction: vi.fn(async () => ({ ok: true })) }))
import { TransactionDialog } from '@/components/growly/transaction-dialog'

const accounts = [{ id: 'a1', name: 'Corriente' }, { id: 'a2', name: 'Ahorros' }]
const categories = [
  { id: 'c1', name: 'Comida', kind: 'EXPENSE' as const },
  { id: 'c2', name: 'Nómina', kind: 'INCOME' as const },
]

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
})
