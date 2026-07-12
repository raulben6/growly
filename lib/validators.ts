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

export const transactionSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
    amount: z.number().int().positive(),
    accountId: z.string().min(1, 'Cuenta requerida'),
    categoryId: z.string().nullable().optional(),
    transferAccountId: z.string().nullable().optional(),
    description: z.string().min(1, 'Descripción requerida'),
    date: z.coerce.date(),
    status: z.enum(['CLEARED', 'PENDING']).default('CLEARED'),
    notes: z.string().optional(),
    currency: z.string().default('USD'),
  })
  .refine((d) => d.type !== 'TRANSFER' || !!d.transferAccountId, {
    message: 'La transferencia requiere cuenta destino',
    path: ['transferAccountId'],
  })
  .refine((d) => d.type !== 'TRANSFER' || d.transferAccountId !== d.accountId, {
    message: 'Origen y destino deben ser distintos',
    path: ['transferAccountId'],
  })

export type TransactionFormValues = z.infer<typeof transactionSchema>

export const recurringRuleBaseSchema = z
  .object({
    type: z.enum(['INCOME', 'EXPENSE']),
    amount: z.number().int().positive(),
    accountId: z.string().min(1, 'Cuenta requerida'),
    categoryId: z.string().nullable().optional(),
    description: z.string().min(1, 'Descripción requerida'),
    frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'YEARLY']),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
  })
  .refine((d) => !d.endDate || d.endDate.getTime() > d.startDate.getTime(), {
    message: 'La fecha fin debe ser posterior al inicio',
    path: ['endDate'],
  })

// Al crear, la primera fecha debe ser reciente/futura (margen de 24h por zonas horarias):
// evita que una regla "desde enero" inunde la app de PENDING vencidos.
export const createRecurringRuleSchema = recurringRuleBaseSchema.refine(
  (d) => d.startDate.getTime() >= Date.now() - 86_400_000,
  { message: 'La primera fecha debe ser hoy o futura', path: ['startDate'] },
)

export type RecurringRuleFormValues = z.infer<typeof recurringRuleBaseSchema>

export const budgetSchema = z.object({
  categoryId: z.string().min(1, 'Categoría requerida'),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(0).max(11), // 0-11, convención JS Date
  amount: z.number().int().positive('El límite debe ser mayor que 0'),
})

export type BudgetFormValues = z.infer<typeof budgetSchema>

export const idSchema = z.string().min(1)
