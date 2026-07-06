import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('prisma', () => {
  it('conecta y cuenta usuarios', async () => {
    const count = await prisma.user.count()
    expect(typeof count).toBe('number')
  })
})
