'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { accountSchema } from '@/lib/validators'
import { createAccountForUser, archiveAccountForUser } from '@/lib/accounts'

export async function createAccount(values: unknown) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  const parsed = accountSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  await createAccountForUser(session.user.id, parsed.data)
  revalidatePath('/cuentas')
  return { ok: true as const }
}

export async function archiveAccount(accountId: string) {
  const session = await auth()
  if (!session?.user?.id) return { ok: false as const, error: 'No autenticado' }

  await archiveAccountForUser(session.user.id, accountId)
  revalidatePath('/cuentas')
  return { ok: true as const }
}
