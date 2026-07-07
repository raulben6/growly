import { prisma } from '@/lib/prisma'
import type { AccountFormValues } from '@/lib/validators'
import {
  accountBalance, cardUtilization, netWorth as computeNetWorth,
  type AccountInput as BalanceAccount, type TxInput,
} from '@/lib/balances'
import type { Account } from '@prisma/client'

export function createAccountForUser(userId: string, data: AccountFormValues) {
  return prisma.account.create({ data: { ...data, userId } })
}

export function getAccountsForUser(userId: string) {
  return prisma.account.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: 'asc' },
  })
}

export function archiveAccountForUser(userId: string, accountId: string) {
  return prisma.account.updateMany({
    where: { id: accountId, userId },
    data: { archived: true },
  })
}

export type AccountWithBalance = Account & {
  balance: number
  utilization: { used: number; available: number; pct: number } | null
}

export async function getAccountsWithBalances(
  userId: string,
): Promise<{ accounts: AccountWithBalance[]; netWorth: number }> {
  const accounts = await prisma.account.findMany({
    where: { userId, archived: false },
    orderBy: { createdAt: 'asc' },
  })
  const txns = await prisma.transaction.findMany({ where: { userId } })

  const balTxns: TxInput[] = txns.map((t) => ({
    type: t.type, amount: t.amount, accountId: t.accountId,
    transferAccountId: t.transferAccountId, status: t.status,
  }))
  const toBal = (a: Account): BalanceAccount => ({
    id: a.id, type: a.type, initialBalance: a.initialBalance, creditLimit: a.creditLimit,
  })

  const withBalances: AccountWithBalance[] = accounts.map((a) => {
    if (a.type === 'CREDIT_CARD') {
      const util = cardUtilization(toBal(a), balTxns)
      return { ...a, balance: -util.used, utilization: util }
    }
    return { ...a, balance: accountBalance(toBal(a), balTxns), utilization: null }
  })

  return { accounts: withBalances, netWorth: computeNetWorth(accounts.map(toBal), balTxns) }
}
