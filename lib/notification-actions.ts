'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { idSchema } from '@/lib/validators'
import { markNotificationReadForUser, markAllNotificationsReadForUser } from '@/lib/notifications'

function revalidate() {
  revalidatePath('/notificaciones')
  revalidatePath('/')
}

export async function markNotificationRead(id: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false as const, error: 'Datos inválidos' }
  try {
    const res = await markNotificationReadForUser(session.user.id, parsedId.data)
    if (!res.ok) return { ok: false as const, error: 'Notificación no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo marcar la notificación' }
  }
  revalidate()
  return { ok: true as const }
}

export async function markAllNotificationsRead() {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  try {
    await markAllNotificationsReadForUser(session.user.id)
  } catch {
    return { ok: false as const, error: 'No se pudieron marcar las notificaciones' }
  }
  revalidate()
  return { ok: true as const }
}
