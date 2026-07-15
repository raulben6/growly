import { ThemeToggle } from './theme-toggle'
import { Plus } from 'lucide-react'
import { NotificationsBell } from './notifications-bell'

export function Topbar({ userName, unread }: { userName: string; unread: number }) {
  return (
    <header className="flex items-center justify-between mb-6">
      <div>
        <div className="text-sm text-muted-foreground font-semibold">Hoy</div>
        <div className="text-2xl font-extrabold tracking-[-0.02em]">Hola, {userName}</div>
      </div>
      <div className="flex items-center gap-3.5">
        <NotificationsBell unread={unread} />
        <ThemeToggle />
        <button className="h-11 px-4 rounded-xl bg-primary text-primary-foreground font-extrabold flex items-center gap-2">
          <Plus size={18} /> Añadir
        </button>
      </div>
    </header>
  )
}
