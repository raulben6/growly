import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarView } from '@/components/growly/calendar-view'
import type { CalendarEvent } from '@/lib/calendar'

const ev = (over: Partial<CalendarEvent>): CalendarEvent => ({
  kind: 'expense', date: new Date(Date.UTC(2026, 6, 5)), label: 'Cine',
  amount: 10_000, meta: 'Entretenimiento', icon: 'ticket', pending: false, ...over,
})

// julio 2026 empieza miércoles → 2 huecos
const cells: (number | null)[] = [null, null, ...Array.from({ length: 31 }, (_, i) => i + 1)]
while (cells.length % 7 !== 0) cells.push(null)

const base = {
  ym: { year: 2026, month: 6 },
  todayDay: 12,
  cells,
  totals: { income: 612_000, expense: 203_600 },
  monthShort: 'jul',
}

describe('CalendarView', () => {
  it('chips de totales y cabecera de semana lunes-primero', () => {
    render(<CalendarView {...base} eventsByDay={[]} />)
    expect(screen.getByText(/Ingresos jul/)).toBeInTheDocument()
    expect(screen.getByText(/Pagos jul/)).toBeInTheDocument()
    expect(screen.getByText('X')).toBeInTheDocument() // miércoles en L M X J V S D
  })

  it('hoy en círculo verde y seleccionado por defecto; agenda del día', () => {
    render(<CalendarView {...base} eventsByDay={[[12, [ev({})]]]} />)
    expect(screen.getByTestId('calendar-today')).toHaveTextContent('12')
    expect(screen.getByText('DOMINGO · 12 JUL')).toBeInTheDocument()
    expect(screen.getByText('Cine')).toBeInTheDocument()
    expect(screen.getByText('Entretenimiento')).toBeInTheDocument()
  })

  it('dots con prioridad y el click cambia la agenda', async () => {
    const user = userEvent.setup()
    render(
      <CalendarView
        {...base}
        eventsByDay={[
          [5, [ev({ kind: 'income', label: 'Nómina', meta: 'Sueldo' }), ev({})]],
          [15, [ev({ kind: 'card', label: 'Corte · Visa', meta: 'Corte de tarjeta', amount: undefined })]],
        ]}
      />,
    )
    expect(screen.getByTestId('dot-5').className).toContain('bg-destructive')
    expect(screen.getByTestId('dot-15').className).toContain('bg-muted-foreground')
    await user.click(screen.getByRole('button', { name: 'Día 5' }))
    expect(screen.getByText('DOMINGO · 5 JUL')).toBeInTheDocument()
    expect(screen.getByText('Nómina')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Día 15' }))
    expect(screen.getByText('Corte · Visa')).toBeInTheDocument()
    expect(screen.getByText('Corte de tarjeta')).toBeInTheDocument()
  })

  it('PENDING en rojo y día vacío con mensaje', async () => {
    const user = userEvent.setup()
    render(
      <CalendarView
        {...base}
        eventsByDay={[[20, [ev({ pending: true, meta: 'Pago programado', label: 'Alquiler' })]]]}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Día 20' }))
    expect(screen.getByText('Pago programado').className).toContain('text-destructive')
    await user.click(screen.getByRole('button', { name: 'Día 21' }))
    expect(screen.getByText('Sin eventos este día.')).toBeInTheDocument()
  })
})
