import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

const getTransactionsForUser = vi.fn()
vi.mock('@/lib/transactions', () => ({
  getTransactionsForUser: (...a: unknown[]) => getTransactionsForUser(...a),
}))
vi.mock('@/lib/categories', () => ({
  getCategoriesForUser: vi.fn(async () => [
    { id: 'c1', name: 'Alimentación', colorHex: '#3B82F6', icon: 'utensils', kind: 'EXPENSE' },
  ]),
}))

import ReportesPage from '@/app/(app)/reportes/page'

// reloj fijado: 12 jul 2026 → mes actual julio, anterior junio
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 12))
})
afterAll(() => vi.useRealTimers())
beforeEach(() => getTransactionsForUser.mockReset())

const txns = [
  { type: 'INCOME', amount: 300_000, date: new Date(Date.UTC(2026, 6, 4)), status: 'CLEARED', categoryId: null },
  { type: 'EXPENSE', amount: 90_000, date: new Date(Date.UTC(2026, 6, 5)), status: 'CLEARED', categoryId: 'c1' },
  { type: 'INCOME', amount: 300_000, date: new Date(Date.UTC(2026, 5, 4)), status: 'CLEARED', categoryId: null },
  { type: 'EXPENSE', amount: 189_000, date: new Date(Date.UTC(2026, 5, 6)), status: 'CLEARED', categoryId: 'c1' },
]

describe('página /reportes', () => {
  it('con datos: chart, KPIs con deltas y top categorías', async () => {
    getTransactionsForUser.mockResolvedValue(txns)
    render(await ReportesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('Reportes')).toBeInTheDocument()
    expect(screen.getByText('Ingresos vs Gastos')).toBeInTheDocument()
    // jul: tasa 70 (jun: 37) → +33 pts; medio/día jul 7500 (12 días), jun 6300 → +$12
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.getByText('+33 pts vs jun')).toBeInTheDocument()
    expect(screen.getByText('+$12 vs jun')).toBeInTheDocument()
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    // toggle
    expect(screen.getByRole('link', { name: '6 meses' })).toHaveAttribute('href', '/reportes')
    expect(screen.getByRole('link', { name: 'Año' })).toHaveAttribute('href', '/reportes?p=1a')
  })

  it('sin datos: estado vacío', async () => {
    getTransactionsForUser.mockResolvedValue([])
    render(await ReportesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/Aún no hay datos suficientes/)).toBeInTheDocument()
    expect(screen.queryByText('Ingresos vs Gastos')).not.toBeInTheDocument()
  })
})
