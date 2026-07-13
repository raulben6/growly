import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/goal-actions', () => ({
  createGoal: vi.fn(), updateGoal: vi.fn(), archiveGoal: vi.fn(),
  addContribution: vi.fn(), deleteContribution: vi.fn(),
}))

const getGoalsForUser = vi.fn()
vi.mock('@/lib/goals', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/goals')>()
  return { ...real, getGoalsForUser: (...a: unknown[]) => getGoalsForUser(...a) }
})

import MetasPage from '@/app/(app)/metas/page'

// reloj fijado para que los totales "este mes" sean deterministas
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 15))
})
afterAll(() => {
  vi.useRealTimers()
})
beforeEach(() => getGoalsForUser.mockReset())

const goal = {
  id: 'g1', userId: 'u1', name: 'Viaje', emoji: '✈️', colorHex: '#3B82F6',
  targetAmount: 500_000, targetDate: new Date(Date.UTC(2026, 11, 1)),
  archived: false, createdAt: new Date(2026, 5, 1), updatedAt: new Date(2026, 5, 1),
  contributions: [
    { id: 'c1', goalId: 'g1', userId: 'u1', amount: 240_000, date: new Date(2026, 6, 10), note: null },
  ],
  saved: 240_000, savedThisMonth: 240_000,
}

describe('página /metas', () => {
  it('con metas: hero, tarjeta con progreso y tarjeta Nueva meta', async () => {
    getGoalsForUser.mockResolvedValue([goal])
    render(await MetasPage())
    expect(screen.getByText('Total ahorrado en metas')).toBeInTheDocument()
    expect(screen.getByText(/1 meta activa/)).toBeInTheDocument()
    expect(screen.getByText('Viaje')).toBeInTheDocument()
    expect(screen.getByText('Meta · dic 2026')).toBeInTheDocument()
    expect(screen.getByText('48% completado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nueva meta/i })).toBeInTheDocument()
  })

  it('vacío: CTA con la tarjeta Nueva meta y sin hero', async () => {
    getGoalsForUser.mockResolvedValue([])
    render(await MetasPage())
    expect(screen.getByText(/Crea tu primera meta/)).toBeInTheDocument()
    expect(screen.queryByText('Total ahorrado en metas')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Nueva meta/i })).toBeInTheDocument()
  })
})
