import 'dotenv/config'
import '@testing-library/jest-dom/vitest'
import { afterAll } from 'vitest'
import { prisma } from '@/lib/prisma'

// Cierra la conexión de Prisma al terminar cada archivo de test: evita acumular
// conexiones abiertas contra la base remota (sin pooler) entre los ~10 archivos
// que la usan, lo que agotaba el límite de conexiones y causaba fallos intermitentes.
afterAll(async () => {
  await prisma.$disconnect()
})
