import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'
import { registerUser } from '@/lib/auth-actions'
import bcrypt from 'bcryptjs'

const email = `test_${Date.now()}@growly.app`

describe.skipIf(!process.env.DATABASE_URL)('registerUser', () => {
  beforeEach(async () => { await prisma.user.deleteMany({ where: { email } }) })
  afterAll(async () => { await prisma.user.deleteMany({ where: { email } }) })

  it('crea el usuario con la contraseña hasheada', async () => {
    const res = await registerUser({ name: 'Test User', email, password: 'supersecret' })
    expect(res.ok).toBe(true)
    const user = await prisma.user.findUnique({ where: { email } })
    expect(user).not.toBeNull()
    expect(user!.passwordHash).not.toBe('supersecret')
    expect(await bcrypt.compare('supersecret', user!.passwordHash!)).toBe(true)
  })

  it('rechaza email duplicado', async () => {
    await registerUser({ name: 'Test User', email, password: 'supersecret' })
    const res = await registerUser({ name: 'Otro', email, password: 'supersecret' })
    expect(res.ok).toBe(false)
  })

  it('rechaza contraseña corta', async () => {
    const res = await registerUser({ name: 'X', email: `x_${Date.now()}@g.app`, password: '123' })
    expect(res.ok).toBe(false)
  })
})
