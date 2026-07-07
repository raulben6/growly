import { z } from 'zod'

export const registerSchema = z.object({
  name: z.string().min(2, 'Nombre demasiado corto'),
  email: z.string().email('Correo no válido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

export const loginSchema = z.object({
  email: z.string().email('Correo no válido'),
  password: z.string().min(1, 'Introduce tu contraseña'),
})

export const accountSchema = z.object({
  name: z.string().min(1, 'Nombre requerido'),
  bankName: z.string().trim().optional(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CASH', 'CREDIT_CARD']),
  currency: z.string().default('USD'),
  colorHex: z.string().default('#10B981'),
  initialBalance: z.number().int().default(0), // centavos
  creditLimit: z.number().int().nonnegative().nullable().optional(),
  statementDay: z.number().int().min(1).max(31).nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  apr: z.number().nonnegative().nullable().optional(),
  minPayment: z.number().int().nonnegative().nullable().optional(),
})

export type AccountFormValues = z.infer<typeof accountSchema>
