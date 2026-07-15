import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('schema Notification', () => {
  it('el cliente expone notification', async () => {
    const count = await prisma.notification.count()
    expect(typeof count).toBe('number')
  })
})
