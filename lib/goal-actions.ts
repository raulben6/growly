'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { goalSchema, contributionSchema, idSchema } from '@/lib/validators'
import {
  createGoalForUser, updateGoalForUser, archiveGoalForUser,
  addContributionForUser, deleteContributionForUser,
} from '@/lib/goals'

function revalidate() {
  revalidatePath('/metas')
  revalidatePath('/')
}

export async function createGoal(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsed = goalSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  try {
    await createGoalForUser(session.user.id, parsed.data)
  } catch {
    return { ok: false as const, error: 'No se pudo crear la meta' }
  }
  revalidate()
  return { ok: true as const }
}

export async function updateGoal(id: unknown, values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false as const, error: 'Datos inválidos' }
  const parsed = goalSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  try {
    const res = await updateGoalForUser(session.user.id, parsedId.data, parsed.data)
    if (!res.ok) return { ok: false as const, error: 'Meta no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo actualizar la meta' }
  }
  revalidate()
  return { ok: true as const }
}

export async function archiveGoal(id: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false as const, error: 'Datos inválidos' }
  try {
    const res = await archiveGoalForUser(session.user.id, parsedId.data)
    if (!res.ok) return { ok: false as const, error: 'Meta no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo archivar la meta' }
  }
  revalidate()
  return { ok: true as const }
}

export async function addContribution(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsed = contributionSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  try {
    const res = await addContributionForUser(session.user.id, parsed.data)
    if (!res.ok) return { ok: false as const, error: 'Meta no encontrada' }
  } catch {
    return { ok: false as const, error: 'No se pudo guardar el aporte' }
  }
  revalidate()
  return { ok: true as const }
}

export async function deleteContribution(id: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }
  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false as const, error: 'Datos inválidos' }
  try {
    const res = await deleteContributionForUser(session.user.id, parsedId.data)
    if (!res.ok) return { ok: false as const, error: 'Aporte no encontrado' }
  } catch {
    return { ok: false as const, error: 'No se pudo borrar el aporte' }
  }
  revalidate()
  return { ok: true as const }
}
