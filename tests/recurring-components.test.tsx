import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/recurring-actions', () => ({
  createRecurringRule: vi.fn(async () => ({ ok: true })),
  updateRecurringRule: vi.fn(async () => ({ ok: true })),
  setRecurringRuleActive: vi.fn(async () => ({ ok: true })),
  deleteRecurringRule: vi.fn(async () => ({ ok: true })),
  confirmTransaction: vi.fn(async () => ({ ok: true })),
}))

import { TransactionRow } from '@/components/growly/transaction-row'
import { ConfirmTransactionButton } from '@/components/growly/confirm-transaction-button'
import { RecurringRow } from '@/components/growly/recurring-row'
import { RecurringDialog, type RecurringFormInitial } from '@/components/growly/recurring-dialog'
import { confirmTransaction, setRecurringRuleActive } from '@/lib/recurring-actions'

const accounts = [{ id: 'a1', name: 'Corriente' }]
const categories = [{ id: 'c1', name: 'Ocio', kind: 'EXPENSE' as const }]

describe('<TransactionRow> con badge y acción', () => {
  it('muestra el badge y renderiza la acción', () => {
    render(
      <TransactionRow description="Netflix" meta="Ocio" signedCents={-1600}
        badge={{ label: 'Vencido', tone: 'danger' }} action={<button>Confirmar</button>} />,
    )
    expect(screen.getByText('Vencido')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument()
  })
  it('sin badge ni acción funciona como antes', () => {
    render(<TransactionRow description="Café" meta="Comida" signedCents={-500} />)
    expect(screen.getByText('Café')).toBeInTheDocument()
  })
})

describe('<ConfirmTransactionButton>', () => {
  it('llama a confirmTransaction con el id', async () => {
    render(<ConfirmTransactionButton id="tx9" />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(confirmTransaction).toHaveBeenCalledWith('tx9'))
  })
})

const initial: RecurringFormInitial = {
  type: 'EXPENSE', amountStr: '16.00', description: 'Netflix', accountId: 'a1',
  categoryId: 'c1', frequency: 'MONTHLY', startDate: '2026-07-12', endDate: '',
}

describe('<RecurringRow>', () => {
  const rule = {
    id: 'r1', description: 'Netflix', type: 'EXPENSE' as const, amount: 1600, active: true,
    freqLabel: 'Cada mes · día 12', nextLabel: 'próxima: 12 ago', accountName: 'Corriente',
    icon: 'film', initial,
  }
  it('muestra descripción, frecuencia, próxima y monto', () => {
    render(<RecurringRow rule={rule} accounts={accounts} categories={categories} />)
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText(/Cada mes · día 12/)).toBeInTheDocument()
    expect(screen.getByText(/próxima: 12 ago/)).toBeInTheDocument()
    expect(screen.getByText('−$16.00')).toBeInTheDocument()
  })
  it('pausar llama a setRecurringRuleActive(id, false)', async () => {
    render(<RecurringRow rule={rule} accounts={accounts} categories={categories} />)
    fireEvent.click(screen.getByTitle('Pausar'))
    await waitFor(() => expect(setRecurringRuleActive).toHaveBeenCalledWith('r1', false))
  })
  it('pausada muestra badge y botón Reanudar', () => {
    render(<RecurringRow rule={{ ...rule, active: false }} accounts={accounts} categories={categories} />)
    expect(screen.getByText('Pausada')).toBeInTheDocument()
    expect(screen.getByTitle('Reanudar')).toBeInTheDocument()
  })
})

describe('<RecurringDialog>', () => {
  it('abre y muestra los campos', () => {
    render(<RecurringDialog accounts={accounts} categories={categories} />)
    fireEvent.click(screen.getByRole('button', { name: /Nueva recurrencia/i }))
    expect(screen.getByLabelText('Importe')).toBeInTheDocument()
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument()
    expect(screen.getByLabelText('Frecuencia')).toBeInTheDocument()
    expect(screen.getByLabelText('Primera fecha')).toBeInTheDocument()
    expect(screen.getByLabelText('Fecha fin (opcional)')).toBeInTheDocument()
  })
})
