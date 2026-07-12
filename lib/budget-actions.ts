'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { budgetSchema, idSchema } from '@/lib/validators'
import { upsertBudgetForUser, deleteBudgetForUser } from '@/lib/budgets'

function revalidate() {
  revalidatePath('/presupuesto')
  revalidatePath('/')
}

export async function upsertBudget(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsed = budgetSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }
  // la categoría debe existir, ser de gasto y visible para el usuario (propia o del sistema)
  const cat = await prisma.category.findFirst({
    where: {
      id: parsed.data.categoryId,
      kind: 'EXPENSE',
      OR: [{ userId: null }, { userId: session.user.id }],
    },
    select: { id: true },
  })
  if (!cat) return { ok: false as const, error: 'Categoría no válida' }

  try {
    await upsertBudgetForUser(session.user.id, parsed.data)
  } catch {
    return { ok: false as const, error: 'No se pudo guardar el presupuesto' }
  }
  revalidate()
  return { ok: true as const }
}

export async function deleteBudget(id: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsedId = idSchema.safeParse(id)
  if (!parsedId.success) return { ok: false as const, error: 'Datos inválidos' }

  try {
    const res = await deleteBudgetForUser(session.user.id, parsedId.data)
    if (!res.ok) return { ok: false as const, error: 'Presupuesto no encontrado' }
  } catch {
    return { ok: false as const, error: 'No se pudo quitar el presupuesto' }
  }
  revalidate()
  return { ok: true as const }
}
