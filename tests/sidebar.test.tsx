import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Sidebar } from '@/components/growly/sidebar'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))

describe('Sidebar', () => {
  it('muestra los 6 items de navegación', () => {
    render(<Sidebar />)
    for (const label of ['Inicio','Movimientos','Presupuesto','Metas','Cuentas y tarjetas','Reportes']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})
