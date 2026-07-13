import { describe, it, expect } from 'vitest'
import { prisma } from '@/lib/prisma'

describe.skipIf(!process.env.DATABASE_URL)('schema Goal + GoalContribution', () => {
  it('el cliente expone goal y goalContribution', async () => {
    expect(typeof (await prisma.goal.count())).toBe('number')
    expect(typeof (await prisma.goalContribution.count())).toBe('number')
  })
})
