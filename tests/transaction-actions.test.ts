import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { prisma } from '@/lib/prisma'

const email = `txaction_${Date.now()}@growly.app`
let userId = ''
let accountId = ''

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: userId } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createTransaction, deleteTransaction } from '@/lib/transaction-actions'

describe.skipIf(!process.env.DATABASE_URL)('transaction actions', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'TxA Test', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    accountId = a.id
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('createTransaction crea el movimiento', async () => {
    const res = await createTransaction({
      type: 'EXPENSE', amount: 5000, accountId, description: 'Café',
      date: '2026-07-06', currency: 'USD',
    })
    expect(res.ok).toBe(true)
    expect((await prisma.transaction.count({ where: { userId } }))).toBe(1)
  })

  it('createTransaction rechaza inválido (transfer sin destino)', async () => {
    const res = await createTransaction({
      type: 'TRANSFER', amount: 5000, accountId, description: 'x', date: '2026-07-06',
    })
    expect(res.ok).toBe(false)
  })

  it('deleteTransaction borra el movimiento', async () => {
    const t = await prisma.transaction.findFirst({ where: { userId } })
    const res = await deleteTransaction(t!.id)
    expect(res.ok).toBe(true)
    expect((await prisma.transaction.count({ where: { userId } }))).toBe(0)
  })
})
