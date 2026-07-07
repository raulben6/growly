'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
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

  try {
    await createTransactionForUser(session.user.id, parsed.data)
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
