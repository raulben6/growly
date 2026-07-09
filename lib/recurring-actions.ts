'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recurringRuleBaseSchema, createRecurringRuleSchema } from '@/lib/validators'
import {
  createRecurringRuleForUser, updateRecurringRuleForUser,
  setRecurringRuleActiveForUser, deleteRecurringRuleForUser,
  confirmTransactionForUser,
} from '@/lib/recurring'

function revalidate() {
  revalidatePath('/movimientos')
  revalidatePath('/cuentas')
  revalidatePath('/')
}

async function checkOwnership(uid: string, data: { accountId: string; categoryId?: string | null }) {
  const ownsAccount = await prisma.account.findFirst({
    where: { id: data.accountId, userId: uid }, select: { id: true },
  })
  if (!ownsAccount) return 'Cuenta no válida'
  if (data.categoryId) {
    const okCat = await prisma.category.findFirst({
      where: { id: data.categoryId, OR: [{ userId: null }, { userId: uid }] }, select: { id: true },
    })
    if (!okCat) return 'Categoría no válida'
  }
  return null
}

export async function createRecurringRule(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsed = createRecurringRuleSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const err = await checkOwnership(session.user.id, parsed.data)
  if (err) return { ok: false as const, error: err }

  try {
    await createRecurringRuleForUser(session.user.id, parsed.data)
  } catch {
    return { ok: false as const, error: 'No se pudo guardar la recurrencia' }
  }
  revalidate()
  return { ok: true as const }
}

export async function updateRecurringRule(id: string, values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsed = recurringRuleBaseSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  const err = await checkOwnership(session.user.id, parsed.data)
  if (err) return { ok: false as const, error: err }

  try {
    const res = await updateRecurringRuleForUser(session.user.id, id, parsed.data)
    if (!res.ok) return { ok: false as const, error: 'Recurrencia no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo actualizar la recurrencia' }
  }
  revalidate()
  return { ok: true as const }
}

export async function setRecurringRuleActive(id: string, active: boolean) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  try {
    const res = await setRecurringRuleActiveForUser(session.user.id, id, active)
    if (!res.ok) return { ok: false as const, error: 'Recurrencia no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo cambiar la recurrencia' }
  }
  revalidate()
  return { ok: true as const }
}

export async function deleteRecurringRule(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  try {
    const res = await deleteRecurringRuleForUser(session.user.id, id)
    if (!res.ok) return { ok: false as const, error: 'Recurrencia no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo borrar la recurrencia' }
  }
  revalidate()
  return { ok: true as const }
}

export async function confirmTransaction(id: string) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  try {
    const res = await confirmTransactionForUser(session.user.id, id)
    if (!res.ok) return { ok: false as const, error: 'Movimiento no encontrado' }
  } catch {
    return { ok: false as const, error: 'No se pudo confirmar el movimiento' }
  }
  revalidate()
  return { ok: true as const }
}
