import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/account-actions', () => ({ createAccount: vi.fn(async () => ({ ok: true })) }))
import { AccountDialog } from '@/components/growly/account-dialog'

describe('<AccountDialog>', () => {
  it('abre el diálogo con el formulario al pulsar el botón', async () => {
    render(<AccountDialog />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir cuenta/i }))
    expect(await screen.findByLabelText('Nombre')).toBeInTheDocument()
    expect(screen.getByLabelText('Saldo inicial')).toBeInTheDocument()
  })

  it('muestra el campo de límite solo para tarjeta de crédito', async () => {
    render(<AccountDialog />)
    await userEvent.click(screen.getByRole('button', { name: /Añadir cuenta/i }))
    expect(screen.queryByLabelText('Límite de crédito')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'CREDIT_CARD')
    expect(screen.getByLabelText('Límite de crédito')).toBeInTheDocument()
  })
})
