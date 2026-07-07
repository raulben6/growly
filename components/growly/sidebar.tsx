'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from './nav-items'
import { LogoMark, Wordmark } from './logo'

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card min-h-screen p-4 flex flex-col gap-1">
      <div className="flex items-center gap-3 px-2 mb-6 mt-2">
        <LogoMark />
        <Wordmark />
      </div>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-sm font-semibold ${
              active ? 'bg-forest text-white' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Icon size={20} className={active ? 'text-primary' : ''} />
            {label}
          </Link>
        )
      })}
    </aside>
  )
}
