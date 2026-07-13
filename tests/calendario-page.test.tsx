import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/recurring', () => ({ materializeRecurringForUser: vi.fn(async () => {}) }))
vi.mock('@/lib/transactions', () => ({
  getTransactionsForUser: vi.fn(async () => [
    {
      id: 't1', type: 'EXPENSE', amount: 12_000, description: 'Cine',
      date: new Date(Date.UTC(2026, 6, 12)), status: 'CLEARED', categoryId: 'c1',
    },
  ]),
}))
vi.mock('@/lib/accounts', () => ({
  getAccountsForUser: vi.fn(async () => [
    { id: 'a1', name: 'Visa', type: 'CREDIT_CARD', archived: false, statementDay: 15, dueDay: 28 },
  ]),
}))
vi.mock('@/lib/categories', () => ({
  getCategoriesForUser: vi.fn(async () => [
    { id: 'c1', name: 'Entretenimiento', icon: 'ticket', colorHex: '#C9584F', kind: 'EXPENSE' },
  ]),
}))

import CalendarioPage from '@/app/(app)/calendario/page'
import { materializeRecurringForUser } from '@/lib/recurring'

// reloj fijado: 12 jul 2026 (domingo) para que "hoy" sea determinista
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 12))
})
afterAll(() => vi.useRealTimers())

describe('página /calendario', () => {
  it('mes actual: hoy seleccionado, agenda con el gasto, dots, chips y materialización', async () => {
    render(await CalendarioPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Calendario')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-today')).toHaveTextContent('12')
    expect(screen.getByText('DOMINGO · 12 JUL')).toBeInTheDocument()
    expect(screen.getByText('Cine')).toBeInTheDocument()
    expect(screen.getByText('Entretenimiento')).toBeInTheDocument()
    expect(screen.getByTestId('dot-12').className).toContain('bg-destructive')
    expect(screen.getByTestId('dot-15').className).toContain('bg-muted-foreground')
    expect(screen.getByText(/Pagos jul/)).toBeInTheDocument()
    expect(materializeRecurringForUser).toHaveBeenCalledWith('u1', expect.any(Date))
  })

  it('otro mes: sin círculo de hoy y día 1 seleccionado', async () => {
    render(await CalendarioPage({ searchParams: Promise.resolve({ m: '2026-06' }) }))
    expect(screen.queryByTestId('calendar-today')).not.toBeInTheDocument()
    expect(screen.getByText('LUNES · 1 JUN')).toBeInTheDocument()
  })
})
