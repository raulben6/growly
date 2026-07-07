import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ComingSoon } from '@/components/growly/coming-soon'

describe('ComingSoon', () => {
  it('muestra el título y el aviso', () => {
    render(<ComingSoon title="Metas" />)
    expect(screen.getByText('Metas')).toBeInTheDocument()
    expect(screen.getByText(/Próximamente/)).toBeInTheDocument()
  })
})
