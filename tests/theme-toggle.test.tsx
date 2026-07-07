import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ThemeToggle } from '@/components/growly/theme-toggle'

const setTheme = vi.fn()
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'light', setTheme }) }))

describe('ThemeToggle', () => {
  it('cambia a oscuro al hacer clic', async () => {
    render(<ThemeToggle />)
    await userEvent.click(screen.getByLabelText('Cambiar tema'))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })
})
