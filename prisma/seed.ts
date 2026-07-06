import { PrismaClient, CategoryKind } from '@prisma/client'
const prisma = new PrismaClient()

const SYSTEM_CATEGORIES: { name: string; icon: string; colorHex: string; kind: CategoryKind }[] = [
  { name: 'Casa',          icon: 'home',      colorHex: '#10B981', kind: 'EXPENSE' },
  { name: 'Alimentación',  icon: 'utensils',  colorHex: '#3B82F6', kind: 'EXPENSE' },
  { name: 'Transporte',    icon: 'car',       colorHex: '#E0AD2E', kind: 'EXPENSE' },
  { name: 'Combustible',   icon: 'fuel',      colorHex: '#C9584F', kind: 'EXPENSE' },
  { name: 'Servicios',     icon: 'plug',      colorHex: '#8B7CF6', kind: 'EXPENSE' },
  { name: 'Internet',      icon: 'wifi',      colorHex: '#3B82F6', kind: 'EXPENSE' },
  { name: 'Electricidad',  icon: 'zap',       colorHex: '#E0AD2E', kind: 'EXPENSE' },
  { name: 'Agua',          icon: 'droplet',   colorHex: '#3B82F6', kind: 'EXPENSE' },
  { name: 'Teléfono',      icon: 'phone',     colorHex: '#10B981', kind: 'EXPENSE' },
  { name: 'Streaming',     icon: 'play',      colorHex: '#C9584F', kind: 'EXPENSE' },
  { name: 'Educación',     icon: 'book',      colorHex: '#3B82F6', kind: 'EXPENSE' },
  { name: 'Salud',         icon: 'heart',     colorHex: '#C9584F', kind: 'EXPENSE' },
  { name: 'Mascotas',      icon: 'paw',       colorHex: '#E0AD2E', kind: 'EXPENSE' },
  { name: 'Seguros',       icon: 'shield',    colorHex: '#8B7CF6', kind: 'EXPENSE' },
  { name: 'Ropa',          icon: 'shirt',     colorHex: '#3B82F6', kind: 'EXPENSE' },
  { name: 'Entretenimiento', icon: 'ticket',  colorHex: '#C9584F', kind: 'EXPENSE' },
  { name: 'Impuestos',     icon: 'landmark',  colorHex: '#8A857E', kind: 'EXPENSE' },
  { name: 'Inversiones',   icon: 'trending-up', colorHex: '#10B981', kind: 'INCOME' },
  { name: 'Ahorros',       icon: 'piggy-bank', colorHex: '#10B981', kind: 'EXPENSE' },
  { name: 'Otros',         icon: 'ellipsis',  colorHex: '#8A857E', kind: 'EXPENSE' },
]

async function main() {
  for (const c of SYSTEM_CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { name: c.name, isSystem: true, userId: null } })
    if (!existing) await prisma.category.create({ data: { ...c, isSystem: true } })
  }
  console.log(`Seed listo: ${SYSTEM_CATEGORIES.length} categorías del sistema.`)
}

main().finally(() => prisma.$disconnect())
