import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Money, SignedAmount } from '@/components/growly/money'

describe('<Money>', () => {
  it('renderiza el importe formateado', () => {
    render(<Money cents={1824000} />)
    expect(screen.getByText('$18,240.00')).toBeInTheDocument()
  })
  it('omite centavos con withCents=false', () => {
    render(<Money cents={1824000} withCents={false} />)
    expect(screen.getByText('$18,240')).toBeInTheDocument()
  })
})

describe('<SignedAmount>', () => {
  it('ingreso: signo + y color de acento', () => {
    render(<SignedAmount cents={306000} />)
    const el = screen.getByText('+$3,060.00')
    expect(el.className).toContain('text-acc')
  })
  it('gasto: signo − y color neutro', () => {
    render(<SignedAmount cents={-6230} />)
    const el = screen.getByText('−$62.30')
    expect(el.className).toContain('text-foreground')
  })
})
