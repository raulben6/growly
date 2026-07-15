import Link from 'next/link'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import {
  evaluateAlertsForUser, getNotificationsForUser, getUnreadCountForUser,
} from '@/lib/notifications'
import { relativeTimeLabel } from '@/lib/alerts'
import { NotificationCard } from '@/components/growly/notification-card'
import { MarkAllReadButton } from '@/components/growly/mark-all-read-button'

const tabCls = (active: boolean) =>
  `rounded-[11px] px-4 py-2 text-sm font-bold ${
    active ? 'bg-forest text-white' : 'border border-border bg-card text-muted-foreground'
  }`

export default async function NotificacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const { f } = await searchParams
  const unreadOnly = f === 'noleidas'
  const now = new Date()

  await evaluateAlertsForUser(userId, now)
  const [items, unread] = await Promise.all([
    getNotificationsForUser(userId, { unreadOnly }),
    getUnreadCountForUser(userId),
  ])

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Notificaciones</h1>
        {unread > 0 && <MarkAllReadButton />}
      </div>

      <div className="flex gap-2">
        <Link href="/notificaciones" className={tabCls(!unreadOnly)}>Todas</Link>
        <Link href="/notificaciones?f=noleidas" className={tabCls(unreadOnly)}>
          No leídas · {unread}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
          <p className="text-sm text-muted-foreground">
            {unreadOnly
              ? 'No tienes notificaciones sin leer.'
              : 'Sin notificaciones. Aquí verás avisos de presupuesto, pagos y tarjetas.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <NotificationCard
              key={item.id}
              n={{
                id: item.id,
                type: item.type,
                title: item.title,
                body: item.body,
                timeLabel: relativeTimeLabel(item.createdAt, now),
                read: item.readAt !== null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
