import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const email = `notifact_${Date.now()}@growly.app`
let userId = ''
let otherId = ''

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { markNotificationRead, markAllNotificationsRead } from '@/lib/notification-actions'

const notif = (uid: string, key: string) => ({
  userId: uid, type: 'BUDGET_WARN' as const, title: 'T', body: 'B', dedupeKey: key,
})

describe.skipIf(!process.env.DATABASE_URL)('notification actions', () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { name: 'NA', email } })).id
    otherId = (await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })).id
    await prisma.notification.createMany({
      data: [notif(userId, 'k1'), notif(userId, 'k2'), notif(otherId, 'k1')],
    })
  })
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('markNotificationRead valida id y ownership', async () => {
    expect(await markNotificationRead(123)).toEqual({ ok: false, error: 'Datos inválidos' })
    const ajena = await prisma.notification.findFirst({ where: { userId: otherId } })
    expect(await markNotificationRead(ajena!.id)).toEqual({ ok: false, error: 'Notificación no encontrada' })
    const propia = await prisma.notification.findFirst({ where: { userId } })
    expect(await markNotificationRead(propia!.id)).toEqual({ ok: true })
    expect((await prisma.notification.findUnique({ where: { id: propia!.id } }))!.readAt).not.toBeNull()
  })

  it('markAllNotificationsRead deja 0 no leídas (y no toca a otros usuarios)', async () => {
    expect(await markAllNotificationsRead()).toEqual({ ok: true })
    expect(await prisma.notification.count({ where: { userId, readAt: null } })).toBe(0)
    expect(await prisma.notification.count({ where: { userId: otherId, readAt: null } })).toBe(1)
  })
})
