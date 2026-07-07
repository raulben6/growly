import {
  Home, Utensils, Car, Fuel, Plug, Wifi, Zap, Droplet, Phone, Play, Book, Heart,
  PawPrint, Shield, Shirt, Ticket, Landmark, TrendingUp, PiggyBank, Ellipsis, Circle,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  home: Home, utensils: Utensils, car: Car, fuel: Fuel, plug: Plug, wifi: Wifi,
  zap: Zap, droplet: Droplet, phone: Phone, play: Play, book: Book, heart: Heart,
  paw: PawPrint, 'paw-print': PawPrint, shield: Shield, shirt: Shirt, ticket: Ticket,
  landmark: Landmark, 'trending-up': TrendingUp, 'piggy-bank': PiggyBank, ellipsis: Ellipsis,
}

export function CategoryIcon({ name, size = 19 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Circle
  return <Icon size={size} />
}
