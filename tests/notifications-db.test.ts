import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  persistAlertCandidates, evaluateAlertsForUser, getNotificationsForUser,
  getUnreadCountForUser, markNotificationReadForUser, markAllNotificationsReadForUser,
} from '@/lib/notifications'

const email = `notif_${Date.now()}@growly.app`
let userId = ''
let otherId = ''
let accountId = ''
let catId = ''

// fecha-calendario de HOY (componentes locales → medianoche UTC): cae en el mes actual
// bajo getters UTC en cualquier momento del mes.
const now = new Date()
const hoyUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))

describe.skipIf(!process.env.DATABASE_URL)('notifications DB', () => {
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { name: 'Notif', email } })).id
    otherId = (await prisma.user.create({ data: { name: 'Otro', email: `otro_${email}` } })).id
    accountId = (await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING' } })).id
    catId = (await prisma.category.create({ data: { userId, name: 'NotifComida', kind: 'EXPENSE' } })).id
    await prisma.budget.create({
      data: { userId, categoryId: catId, year: now.getFullYear(), month: now.getMonth(), amount: 100_000 },
    })
    await prisma.transaction.create({
      data: {
        userId, accountId, categoryId: catId, type: 'EXPENSE', amount: 86_000,
        description: 'Súper', date: hoyUTC, status: 'CLEARED',
      },
    })
  })
  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: [userId, otherId] } } })
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.budget.deleteMany({ where: { userId } })
    await prisma.category.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } })
  })

  it('evaluateAlertsForUser crea la WARN del 86% y es idempotente', async () => {
    await evaluateAlertsForUser(userId, now)
    let list = await getNotificationsForUser(userId)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ type: 'BUDGET_WARN' })
    await evaluateAlertsForUser(userId, now)
    list = await getNotificationsForUser(userId)
    expect(list).toHaveLength(1) // sin duplicar
  })

  it('cruzar a excedido crea la OVER sin duplicar la WARN', async () => {
    await prisma.transaction.create({
      data: {
        userId, accountId, categoryId: catId, type: 'EXPENSE', amount: 20_000,
        description: 'Extra', date: hoyUTC, status: 'CLEARED',
      },
    })
    await evaluateAlertsForUser(userId, now)
    const list = await getNotificationsForUser(userId)
    expect(list).toHaveLength(2)
    expect(list.map((n) => n.type).sort()).toEqual(['BUDGET_OVER', 'BUDGET_WARN'])
  })

  it('un PENDING que vence pronto genera PAYMENT_DUE', async () => {
    const in2days = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) + 2 * 86_400_000)
    await prisma.transaction.create({
      data: {
        userId, accountId, type: 'EXPENSE', amount: 120_000,
        description: 'Alquiler', date: in2days, status: 'PENDING',
      },
    })
    await evaluateAlertsForUser(userId, now)
    const due = (await getNotificationsForUser(userId)).find((n) => n.type === 'PAYMENT_DUE')
    expect(due).toBeDefined()
    expect(due!.body).toContain('Alquiler')
  })

  it('unreadOnly, unreadCount, markRead con ownership y markAll', async () => {
    expect(await getUnreadCountForUser(userId)).toBe(3)
    const first = (await getNotificationsForUser(userId, { unreadOnly: true }))[0]
    expect(await markNotificationReadForUser(otherId, first.id)).toEqual({ ok: false })
    expect(await markNotificationReadForUser(userId, first.id)).toEqual({ ok: true })
    expect(await markNotificationReadForUser(userId, first.id)).toEqual({ ok: false }) // ya leída
    expect(await getUnreadCountForUser(userId)).toBe(2)
    expect(await getNotificationsForUser(userId, { unreadOnly: true })).toHaveLength(2)
    await markAllNotificationsReadForUser(userId)
    expect(await getUnreadCountForUser(userId)).toBe(0)
  })

  it('persistAlertCandidates sin candidatas no escribe', async () => {
    const before = await prisma.notification.count({ where: { userId } })
    await persistAlertCandidates(userId, [])
    expect(await prisma.notification.count({ where: { userId } })).toBe(before)
  })
})
