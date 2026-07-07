import { ThemeToggle } from './theme-toggle'
import { Bell, Plus } from 'lucide-react'

export function Topbar({ userName }: { userName: string }) {
  return (
    <header className="flex items-center justify-between mb-6">
      <div>
        <div className="text-sm text-muted-foreground font-semibold">Hoy</div>
        <div className="text-2xl font-extrabold tracking-[-0.02em]">Hola, {userName}</div>
      </div>
      <div className="flex items-center gap-3.5">
        <button aria-label="Notificaciones" className="w-11 h-11 rounded-xl border border-border bg-card flex items-center justify-center">
          <Bell size={20} />
        </button>
        <ThemeToggle />
        <button className="h-11 px-4 rounded-xl bg-primary text-primary-foreground font-extrabold flex items-center gap-2">
          <Plus size={18} /> Añadir
        </button>
      </div>
    </header>
  )
}
