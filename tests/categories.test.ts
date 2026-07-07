import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { getCategoriesForUser } from '@/lib/categories'

describe.skipIf(!process.env.DATABASE_URL)('getCategoriesForUser', () => {
  const email = `cat_${Date.now()}@growly.app`
  let userId = ''
  beforeAll(async () => {
    const u = await prisma.user.create({ data: { name: 'Cat Test', email } })
    userId = u.id
    await prisma.category.create({ data: { userId, name: 'Mi categoría', kind: 'EXPENSE' } })
  })
  afterAll(async () => {
    await prisma.category.deleteMany({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
  })

  it('incluye las del sistema y las propias', async () => {
    const cats = await getCategoriesForUser(userId)
    expect(cats.some((c) => c.isSystem && c.name === 'Alimentación')).toBe(true)
    expect(cats.some((c) => c.userId === userId && c.name === 'Mi categoría')).toBe(true)
  })
})
