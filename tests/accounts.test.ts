import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { createAccountForUser, getAccountsForUser, archiveAccountForUser } from '@/lib/accounts'
import { getAccountsWithBalances } from '@/lib/accounts'

const email = `acc_${Date.now()}@growly.app`
let userId: string

describe.skipIf(!process.env.DATABASE_URL)('lib/accounts CRUD', () => {
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Acc Test', email } })
    userId = u.id
  })
  afterAll(async () => {
    await prisma.account.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('crea una cuenta para el usuario', async () => {
    const acc = await createAccountForUser(userId, {
      name: 'Cuenta corriente', bankName: 'BBVA', type: 'CHECKING',
      currency: 'USD', colorHex: '#10B981', initialBalance: 1234000,
    })
    expect(acc.id).toBeTruthy()
    expect(acc.userId).toBe(userId)
    expect(acc.initialBalance).toBe(1234000)
  })

  it('lista solo cuentas no archivadas del usuario', async () => {
    const list = await getAccountsForUser(userId)
    expect(list.length).toBe(1)
    expect(list[0].name).toBe('Cuenta corriente')
  })

  it('archiva la cuenta (y no la lista después)', async () => {
    const list = await getAccountsForUser(userId)
    const res = await archiveAccountForUser(userId, list[0].id)
    expect(res.count).toBe(1)
    expect((await getAccountsForUser(userId)).length).toBe(0)
  })

  it('no archiva cuentas de otro usuario', async () => {
    const acc = await createAccountForUser(userId, {
      name: 'Otra', type: 'CASH', currency: 'USD', colorHex: '#10B981', initialBalance: 0,
    })
    const res = await archiveAccountForUser('user-inexistente', acc.id)
    expect(res.count).toBe(0)
  })
})

describe.skipIf(!process.env.DATABASE_URL)('getAccountsWithBalances', () => {
  const email2 = `bal_${Date.now()}@growly.app`
  let uid2: string
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Bal Test', email: email2 } })
    uid2 = u.id
    await createAccountForUser(uid2, { name: 'Corriente', type: 'CHECKING', currency: 'USD', colorHex: '#10B981', initialBalance: 1000000 })
    await createAccountForUser(uid2, { name: 'Visa', type: 'CREDIT_CARD', currency: 'USD', colorHex: '#12211C', initialBalance: 64000, creditLimit: 300000 })
  })
  afterAll(async () => {
    await prisma.account.deleteMany({ where: { userId: uid2 } })
    await prisma.user.delete({ where: { id: uid2 } })
  })

  it('calcula balance por cuenta y patrimonio neto', async () => {
    const { accounts, netWorth } = await getAccountsWithBalances(uid2)
    const checking = accounts.find((a) => a.type === 'CHECKING')!
    const card = accounts.find((a) => a.type === 'CREDIT_CARD')!
    expect(checking.balance).toBe(1000000)
    expect(checking.utilization).toBeNull()
    expect(card.utilization).toEqual({ used: 64000, available: 236000, pct: 21 })
    expect(card.balance).toBe(-64000)
    // $10,000 - deuda $640 = $9,360
    expect(netWorth).toBe(1000000 - 64000)
  })
})
