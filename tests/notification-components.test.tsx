import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsBell } from '@/components/growly/notifications-bell'
import { NotificationCard, type NotificationView } from '@/components/growly/notification-card'
import { MarkAllReadButton } from '@/components/growly/mark-all-read-button'
import { markNotificationRead, markAllNotificationsRead } from '@/lib/notification-actions'

vi.mock('@/lib/notification-actions', () => ({
  markNotificationRead: vi.fn(async () => ({ ok: true })),
  markAllNotificationsRead: vi.fn(async () => ({ ok: true })),
}))

beforeEach(() => vi.clearAllMocks())

const base: NotificationView = {
  id: 'n1', type: 'BUDGET_WARN', title: 'Cerca del límite de presupuesto',
  body: 'Llevas el 86% de tu presupuesto de julio.', timeLabel: 'Hace 2 h', read: false,
}

describe('NotificationsBell', () => {
  it('sin badge con 0; número con >0; 99+ con >99; link a /notificaciones', () => {
    const { rerender } = render(<NotificationsBell unread={0} />)
    expect(screen.queryByTestId('bell-badge')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Notificaciones' })).toHaveAttribute('href', '/notificaciones')
    rerender(<NotificationsBell unread={3} />)
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: 'Notificaciones: 3 sin leer' })).toBeInTheDocument()
    rerender(<NotificationsBell unread={120} />)
    expect(screen.getByTestId('bell-badge')).toHaveTextContent('99+')
  })
})

describe('NotificationCard', () => {
  it('no leída: dot visible y el click la marca', async () => {
    const user = userEvent.setup()
    render(<NotificationCard n={base} />)
    expect(screen.getByTestId('dot-n1')).toBeInTheDocument()
    expect(screen.getByText('Hace 2 h')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Cerca del límite/ }))
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n1'))
  })

  it('leída: opacidad, sin dot y sin click', async () => {
    const user = userEvent.setup()
    render(<NotificationCard n={{ ...base, read: true }} />)
    expect(screen.queryByTestId('dot-n1')).not.toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /Cerca del límite/ })
    expect(btn).toBeDisabled()
    expect(btn.className).toContain('opacity-60')
    await user.click(btn)
    expect(markNotificationRead).not.toHaveBeenCalled()
  })

  it('tinte por tipo: WARN ámbar, OVER rojo', () => {
    const { rerender } = render(<NotificationCard n={base} />)
    expect(screen.getByTestId('icon-n1').className).toContain('text-warning')
    rerender(<NotificationCard n={{ ...base, type: 'BUDGET_OVER' }} />)
    expect(screen.getByTestId('icon-n1').className).toContain('text-destructive')
  })

  it('muestra el error de la action', async () => {
    vi.mocked(markNotificationRead).mockResolvedValueOnce({ ok: false, error: 'No se pudo marcar la notificación' })
    const user = userEvent.setup()
    render(<NotificationCard n={base} />)
    await user.click(screen.getByRole('button', { name: /Cerca del límite/ }))
    expect(await screen.findByText('No se pudo marcar la notificación')).toBeInTheDocument()
  })
})

describe('MarkAllReadButton', () => {
  it('llama a la action', async () => {
    const user = userEvent.setup()
    render(<MarkAllReadButton />)
    await user.click(screen.getByRole('button', { name: 'Marcar todas como leídas' }))
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled())
  })
})
