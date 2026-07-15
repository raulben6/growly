import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/notification-actions', () => ({
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))

const getNotificationsForUser = vi.fn()
const getUnreadCountForUser = vi.fn()
const evaluateAlertsForUser = vi.fn(async () => {})
vi.mock('@/lib/notifications', () => ({
  getNotificationsForUser: (...a: unknown[]) => getNotificationsForUser(...a),
  getUnreadCountForUser: (...a: unknown[]) => getUnreadCountForUser(...a),
  evaluateAlertsForUser: (...a: unknown[]) => evaluateAlertsForUser(...a),
}))

import NotificacionesPage from '@/app/(app)/notificaciones/page'

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 12, 12))
})
afterAll(() => vi.useRealTimers())
beforeEach(() => {
  getNotificationsForUser.mockReset()
  getUnreadCountForUser.mockReset()
  evaluateAlertsForUser.mockClear()
})

const n = (over: Record<string, unknown>) => ({
  id: 'n1', userId: 'u1', type: 'BUDGET_WARN', title: 'Cerca del límite de presupuesto',
  body: 'Llevas el 86% de tu presupuesto de julio.', dedupeKey: 'k',
  readAt: null, createdAt: new Date(2026, 6, 12, 10), ...over,
})

describe('página /notificaciones', () => {
  it('evalúa, lista con tiempo relativo y chips con conteo', async () => {
    getNotificationsForUser.mockResolvedValue([
      n({}),
      n({
        id: 'n2', type: 'PAYMENT_DUE', title: 'Pago próximo',
        readAt: new Date(2026, 6, 12, 11), createdAt: new Date(2026, 6, 12, 9),
      }),
    ])
    getUnreadCountForUser.mockResolvedValue(1)
    render(await NotificacionesPage({ searchParams: Promise.resolve({}) }))
    expect(evaluateAlertsForUser).toHaveBeenCalledWith('u1', expect.any(Date))
    expect(screen.getByText('Cerca del límite de presupuesto')).toBeInTheDocument()
    expect(screen.getByText('Hace 2 h')).toBeInTheDocument()
    expect(screen.getByTestId('dot-n1')).toBeInTheDocument()
    expect(screen.queryByTestId('dot-n2')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /No leídas · 1/ })).toHaveAttribute(
      'href', '/notificaciones?f=noleidas',
    )
    expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeInTheDocument()
  })

  it('filtro no leídas pide unreadOnly y el vacío filtrado tiene su copy', async () => {
    getNotificationsForUser.mockResolvedValue([])
    getUnreadCountForUser.mockResolvedValue(0)
    render(await NotificacionesPage({ searchParams: Promise.resolve({ f: 'noleidas' }) }))
    expect(getNotificationsForUser).toHaveBeenCalledWith('u1', { unreadOnly: true })
    expect(screen.getByText('No tienes notificaciones sin leer.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Marcar todas como leídas' })).not.toBeInTheDocument()
  })

  it('vacío total: copy de bienvenida', async () => {
    getNotificationsForUser.mockResolvedValue([])
    getUnreadCountForUser.mockResolvedValue(0)
    render(await NotificacionesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText(/Aquí verás avisos de presupuesto, pagos y tarjetas/)).toBeInTheDocument()
  })
})
