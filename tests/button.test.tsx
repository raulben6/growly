import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Button } from '@/components/ui/button'
import { LogoMark, Wordmark } from '@/components/growly/logo'

describe('primitivos de UI', () => {
  it('Button primario usa el color de marca', () => {
    render(<Button>Añadir</Button>)
    const btn = screen.getByRole('button', { name: 'Añadir' })
    expect(btn.className).toContain('bg-primary')
  })
  it('Wordmark muestra Growly', () => {
    render(<><LogoMark /><Wordmark /></>)
    expect(screen.getByText('Growly')).toBeInTheDocument()
  })
})
