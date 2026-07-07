import { prisma } from '@/lib/prisma'
import type { AccountFormValues } from '@/lib/validators'

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
