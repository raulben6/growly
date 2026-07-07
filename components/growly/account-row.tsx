import type { ReactNode } from 'react'
import { Wallet } from 'lucide-react'
import { Money } from '@/components/growly/money'

export function AccountRow({
  name, subtitle, balance, icon,
}: {
  name: string
  subtitle: string
  balance: number
  icon?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon ?? <Wallet size={20} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-foreground">{name}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <Money cents={balance} className="text-base font-extrabold text-foreground" />
    </div>
  )
}
