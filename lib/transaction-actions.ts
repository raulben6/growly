'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { transactionSchema } from '@/lib/validators'
import { createTransactionForUser, deleteTransactionForUser } from '@/lib/transactions'

function revalidate() {
  revalidatePath('/movimientos')
  revalidatePath('/cuentas')
  revalidatePath('/')
}

export async function createTransaction(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsed = transactionSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const d = parsed.data
  const uid = session.user.id

  const ownsAccount = await prisma.account.findFirst({ where: { id: d.accountId, userId: uid }, select: { id: true } })
  if (!ownsAccount) return { ok: false as const, error: 'Cuenta no válida' }
  if (d.transferAccountId) {
    const ownsDest = await prisma.account.findFirst({ where: { id: d.transferAccountId, userId: uid }, select: { id: true } })
    if (!ownsDest) return { ok: false as const, error: 'Cuenta destino no válida' }
  }
  if (d.categoryId) {
    const okCat = await prisma.category.findFirst({ where: { id: d.categoryId, OR: [{ userId: null }, { userId: uid }] }, select: { id: true } })
    if (!okCat) return { ok: false as const, error: 'Categoría no válida' }
  }

  try {
    await createTransactionForUser(uid, d)
  } catch {
    return { ok: false as const, error: 'No se pudo guardar el movimiento' }
  }
  revalidate()
  return { ok: true as const }
}

export async function deleteTransaction(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  try {
    await deleteTransactionForUser(session.user.id, id)
  } catch {
    return { ok: false as const, error: 'No se pudo borrar el movimiento' }
  }
  revalidate()
  return { ok: true as const }
}
