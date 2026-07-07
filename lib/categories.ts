import { prisma } from '@/lib/prisma'

export function getCategoriesForUser(userId: string) {
  return prisma.category.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: { name: 'asc' },
  })
}
