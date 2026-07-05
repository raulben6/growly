import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

function Hello() {
  return <h1>Growly</h1>
}

describe('smoke', () => {
  it('renderiza texto', () => {
    render(<Hello />)
    expect(screen.getByText('Growly')).toBeInTheDocument()
  })
})
