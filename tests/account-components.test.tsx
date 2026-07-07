import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AccountRow } from '@/components/growly/account-row'
import { CreditCardView } from '@/components/growly/credit-card'

describe('<AccountRow>', () => {
  it('muestra nombre, subtítulo e importe', () => {
    render(<AccountRow name="Cuenta corriente" subtitle="BBVA" balance={1234000} />)
    expect(screen.getByText('Cuenta corriente')).toBeInTheDocument()
    expect(screen.getByText('BBVA')).toBeInTheDocument()
    expect(screen.getByText('$12,340.00')).toBeInTheDocument()
  })
})

describe('<CreditCardView>', () => {
  it('muestra nombre, saldo usado, límite y % de utilización', () => {
    render(<CreditCardView name="Growly Visa" used={64000} limit={300000} pct={21} />)
    expect(screen.getByText('Growly Visa')).toBeInTheDocument()
    expect(screen.getByText('$640.00')).toBeInTheDocument()
    expect(screen.getByText('21%')).toBeInTheDocument()
  })
  it('marca en rojo la utilización alta', () => {
    render(<CreditCardView name="X" used={280000} limit={300000} pct={93} />)
    expect(screen.getByText('93%').className).toContain('text-destructive')
  })
})
