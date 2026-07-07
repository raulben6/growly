import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import {
  createTransactionForUser, getTransactionsForUser, deleteTransactionForUser, groupTransactionsByDay,
} from '@/lib/transactions'

describe('groupTransactionsByDay (puro)', () => {
  const now = new Date('2026-07-06T12:00:00Z')
  it('etiqueta Hoy / Ayer / fecha y ordena desc', () => {
    const txns = [
      { id: 'a', date: new Date('2026-07-06T09:00:00Z') },
      { id: 'b', date: new Date('2026-07-05T20:00:00Z') },
      { id: 'c', date: new Date('2026-07-01T10:00:00Z') },
    ]
    const groups = groupTransactionsByDay(txns, now)
    expect(groups.map((g) => g.label)).toEqual(['Hoy', 'Ayer', '1 jul'])
    expect(groups[0].items[0].id).toBe('a')
  })
})

describe.skipIf(!process.env.DATABASE_URL)('lib/transactions CRUD', () => {
  const email = `tx_${Date.now()}@growly.app`
  let userId = ''
  let accountId = ''
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Tx Test', email } })
    userId = u.id
    const a = await prisma.account.create({ data: { userId, name: 'C', type: 'CHECKING', initialBalance: 0 } })
    accountId = a.id
  })
  afterAll(async () => {
    await prisma.transaction.deleteMany({ where: { userId } })
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('crea y lista movimientos (desc)', async () => {
    await createTransactionForUser(userId, {
      type: 'EXPENSE', amount: 6230, accountId, description: 'Mercadona',
      date: new Date('2026-07-05'), status: 'CLEARED', currency: 'USD',
    })
    await createTransactionForUser(userId, {
      type: 'INCOME', amount: 306000, accountId, description: 'Nómina',
      date: new Date('2026-07-06'), status: 'CLEARED', currency: 'USD',
    })
    const all = await getTransactionsForUser(userId)
    expect(all.length).toBe(2)
    expect(all[0].description).toBe('Nómina') // más reciente primero
    const gastos = await getTransactionsForUser(userId, { kind: 'EXPENSE' })
    expect(gastos.length).toBe(1)
  })

  it('borra un movimiento del usuario (y no de otro)', async () => {
    const all = await getTransactionsForUser(userId)
    expect((await deleteTransactionForUser('otro', all[0].id)).count).toBe(0)
    expect((await deleteTransactionForUser(userId, all[0].id)).count).toBe(1)
    expect((await getTransactionsForUser(userId)).length).toBe(1)
  })
})
