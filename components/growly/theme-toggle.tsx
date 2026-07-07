'use client'

import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <button
      aria-label="Cambiar tema"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="w-11 h-11 rounded-xl border border-border bg-card flex items-center justify-center"
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  )
}
