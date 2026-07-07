import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { CategoryIcon } from '@/components/growly/category-icon'
import { TransactionRow } from '@/components/growly/transaction-row'
import { Money } from '@/components/growly/money'

describe('<CategoryIcon>', () => {
  it('renderiza un svg para un nombre conocido y para uno desconocido (fallback)', () => {
    const { container: known } = render(<CategoryIcon name="utensils" />)
    expect(known.querySelector('svg')).toBeInTheDocument()
    const { container: unknown } = render(<CategoryIcon name="no-existe-xyz" />)
    expect(unknown.querySelector('svg')).toBeInTheDocument()
  })
})

describe('<TransactionRow>', () => {
  it('muestra descripción, meta e importe con signo', () => {
    render(<TransactionRow description="Nómina" meta="Ingreso · 09:12" signedCents={306000} />)
    expect(screen.getByText('Nómina')).toBeInTheDocument()
    expect(screen.getByText('Ingreso · 09:12')).toBeInTheDocument()
    expect(screen.getByText('+$3,060.00')).toBeInTheDocument()
  })
})

describe('<Money signed>', () => {
  it('antepone − a negativos y nada a positivos', () => {
    render(<Money cents={-5000} signed />)
    expect(screen.getByText('−$50.00')).toBeInTheDocument()
    render(<Money cents={5000} signed />)
    expect(screen.getByText('$50.00')).toBeInTheDocument()
  })
})
