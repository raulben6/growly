import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('seed', () => {
  it('hay exactamente 20 categorías del sistema', async () => {
    const count = await prisma.category.count({ where: { isSystem: true, userId: null } })
    expect(count).toBe(20)
  })
})
