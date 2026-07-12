import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/budget-actions', () => ({
  upsertBudget: vi.fn(),
  deleteBudget: vi.fn(),
}))

const getBudgetsForMonth = vi.fn()
vi.mock('@/lib/budgets', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/budgets')>()
  return { ...real, getBudgetsForMonth: (...a: unknown[]) => getBudgetsForMonth(...a) }
})
vi.mock('@/lib/transactions', () => ({
  getTransactionsForUser: vi.fn(async () => [
    {
      type: 'EXPENSE', status: 'CLEARED', amount: 25_000,
      date: new Date(2026, 4, 10), categoryId: 'c1',
    },
  ]),
}))
vi.mock('@/lib/categories', () => ({
  getCategoriesForUser: vi.fn(async () => [
    { id: 'c1', name: 'Alimentación', colorHex: '#3B82F6', icon: 'utensils', kind: 'EXPENSE' },
    { id: 'c2', name: 'Transporte', colorHex: '#E0AD2E', icon: 'car', kind: 'EXPENSE' },
    { id: 'c3', name: 'Sueldo', colorHex: '#10B981', icon: 'trending-up', kind: 'INCOME' },
  ]),
}))

import PresupuestoPage from '@/app/(app)/presupuesto/page'

// Fijar reloj para que los chequeos de "mes actual" sean deterministas
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 15))
})
afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => getBudgetsForMonth.mockReset())

describe('página /presupuesto', () => {
  it('con presupuesto: hero, fila de categoría y % usados (mayo 2026, sin forecast)', async () => {
    getBudgetsForMonth.mockResolvedValue([
      { id: 'b1', userId: 'u1', categoryId: 'c1', year: 2026, month: 4, amount: 100_000 },
    ])
    render(await PresupuestoPage({ searchParams: Promise.resolve({ m: '2026-05' }) }))
    expect(screen.getByText('Mayo 2026')).toBeInTheDocument()
    expect(screen.getByText(/Gastado de/)).toBeInTheDocument()
    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    // 25_000 / 100_000 → 25%; mes no actual → sin "quedan N días" ni "A este ritmo"
    expect(screen.getByText('25% del presupuesto usado')).toBeInTheDocument()
    expect(screen.queryByText(/A este ritmo/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Añadir categoría/i })).toBeInTheDocument()
  })

  it('vacío: CTA de primer presupuesto', async () => {
    getBudgetsForMonth.mockResolvedValue([])
    render(await PresupuestoPage({ searchParams: Promise.resolve({ m: '2026-04' }) }))
    expect(screen.getByText(/Crea tu primer presupuesto/)).toBeInTheDocument()
    expect(screen.queryByText(/Gastado de/)).not.toBeInTheDocument()
  })
})
