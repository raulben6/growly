import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/account-actions', () => ({ createAccount: vi.fn(async () => ({ ok: true })) }))
import { AccountDialog } from '@/components/growly/account-dialog'
import { createAccount } from '@/lib/account-actions'

beforeEach(() => vi.clearAllMocks())

describe('<AccountDialog>', () => {
  it('abre el diálogo con el formulario al pulsar el botón', async () => {
    render(<AccountDialog />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir cuenta/i }))
    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Saldo inicial')).toBeInTheDocument()
  })

  it('muestra límite, día de corte y día de vencimiento solo para tarjeta de crédito', async () => {
    render(<AccountDialog />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir cuenta/i }))
    expect(screen.queryByLabelText('Límite de crédito')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Día de corte')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Día de vencimiento')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'CREDIT_CARD')
    expect(screen.getByLabelText('Límite de crédito')).toBeInTheDocument()
    expect(screen.getByLabelText('Día de corte')).toBeInTheDocument()
    expect(screen.getByLabelText('Día de vencimiento')).toBeInTheDocument()
  })

  it('envía statementDay y dueDay al crear una tarjeta', async () => {
    render(<AccountDialog />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir cuenta/i }))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Visa')
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'CREDIT_CARD')
    await userEvent.type(screen.getByLabelText('Límite de crédito'), '2000')
    await userEvent.type(screen.getByLabelText('Día de corte'), '15')
    await userEvent.type(screen.getByLabelText('Día de vencimiento'), '28')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    await waitFor(() =>
      expect(createAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Visa', type: 'CREDIT_CARD', creditLimit: 200_000,
          statementDay: 15, dueDay: 28,
        }),
      ),
    )
  })

  it('una cuenta no-tarjeta manda statementDay/dueDay en null', async () => {
    render(<AccountDialog />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir cuenta/i }))
    await userEvent.type(screen.getByLabelText('Nombre'), 'Corriente')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    await waitFor(() =>
      expect(createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CHECKING', statementDay: null, dueDay: null, creditLimit: null }),
      ),
    )
  })
})
