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
