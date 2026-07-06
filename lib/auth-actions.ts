'use server'

import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { registerSchema } from '@/lib/validators'

export async function registerUser(input: { name: string; email: string; password: string }) {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const { name, email, password } = parsed.data
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return { ok: false as const, error: 'Ese correo ya está registrado' }
  const passwordHash = await bcrypt.hash(password, 10)
  await prisma.user.create({ data: { name, email, passwordHash } })
  return { ok: true as const }
}

export async function requestPasswordReset(email: string) {
  // En dev: se registra el enlace por consola. Proveedor de correo real en fase posterior.
  const user = await prisma.user.findUnique({ where: { email } })
  if (user) console.log(`[reset] enlace para ${email}: /reset?token=DEV_TOKEN`)
  return { ok: true as const } // no revela si el correo existe
}
