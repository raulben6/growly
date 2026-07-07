import { Home, ArrowUpDown, PieChart, Target, CreditCard, BarChart3, type LucideIcon } from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { href: '/',            label: 'Inicio',             icon: Home },
  { href: '/movimientos', label: 'Movimientos',        icon: ArrowUpDown },
  { href: '/presupuesto', label: 'Presupuesto',        icon: PieChart },
  { href: '/metas',       label: 'Metas',              icon: Target },
  { href: '/cuentas',     label: 'Cuentas y tarjetas', icon: CreditCard },
  { href: '/reportes',    label: 'Reportes',           icon: BarChart3 },
]
