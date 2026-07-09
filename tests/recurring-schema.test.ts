import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('schema RecurringRule', () => {
  it('el cliente expone recurringRule', async () => {
    const count = await prisma.recurringRule.count()
    expect(typeof count).toBe('number')
  })
})
