// Configuración de Prisma (reemplaza `package.json#prisma`, que se deprecará en
// Prisma 7). Ver https://pris.ly/prisma-config.
//
// IMPORTANTE: al existir este archivo, Prisma DEJA de cargar `.env`
// automáticamente. Por eso importamos `dotenv/config` para que los comandos de
// CLI (migrate deploy / db seed / generate) sigan resolviendo DATABASE_URL en
// local. En CI y en Vercel no hay `.env` → dotenv no encuentra archivo y no hace
// nada; DATABASE_URL llega por el entorno de la plataforma.
import 'dotenv/config'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    // El comando de seed vivía en `package.json#prisma.seed`; ahora vive aquí.
    seed: 'tsx prisma/seed.ts',
  },
})
