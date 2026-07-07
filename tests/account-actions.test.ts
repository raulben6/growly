import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const email = `action_${Date.now()}@growly.app`
let userId = ''

// auth() devuelve el usuario de prueba; revalidatePath es no-op en test
vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createAccount, archiveAccount } from '@/lib/account-actions'

describe.skipIf(!process.env.DATABASE_URL)('account actions', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Action Test', email } })
    userId = u.id
  })
  afterAll(async () => {
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('createAccount crea la cuenta del usuario autenticado', async () => {
    const res = await createAccount({
      name: 'Efectivo', type: 'CASH', currency: 'USD', colorHex: '#10B981', initialBalance: 50000,
    })
    expect(res.ok).toBe(true)
    const list = await prisma.account.findMany({ where: { userId } })
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('Efectivo')
  })

  it('createAccount rechaza datos inválidos', async () => {
    const res = await createAccount({ name: '', type: 'CASH' })
    expect(res.ok).toBe(false)
  })

  it('archiveAccount archiva la cuenta', async () => {
    const acc = await prisma.account.findFirst({ where: { userId } })
    const res = await archiveAccount(acc!.id)
    expect(res.ok).toBe(true)
    expect((await prisma.account.findFirst({ where: { userId, archived: false } }))).toBeNull()
  })
})
