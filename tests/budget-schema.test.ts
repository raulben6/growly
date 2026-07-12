import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('schema Budget', () => {
  it('el cliente expone budget', async () => {
    const count = await prisma.budget.count()
    expect(typeof count).toBe('number')
  })
})
