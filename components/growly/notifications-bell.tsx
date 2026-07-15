import Link from 'next/link'
import { Bell } from 'lucide-react'

export function NotificationsBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/notificaciones"
      aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : 'Notificaciones'}
      className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card"
    >
      <Bell size={20} aria-hidden />
      {unread > 0 && (
        <span
          data-testid="bell-badge"
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-extrabold text-white"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
