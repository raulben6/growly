'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { registerUser } from '@/lib/auth-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogoMark } from '@/components/growly/logo'

export default function RegisterPage() {
  const router = useRouter()
  const [state, setState] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const res = await registerUser(state)
    if (!res.ok) { setError(res.error); setLoading(false); return }
    await signIn('credentials', { email: state.email, password: state.password, redirect: false })
    router.push('/')
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="mb-3"><LogoMark size={52} /></div>
      <h1 className="text-[27px] font-extrabold tracking-[-0.02em]">Crea tu cuenta</h1>
      <p className="text-sm text-muted-foreground mb-3">Empieza a ordenar tus finanzas hoy</p>
      <div><Label htmlFor="name">Nombre completo</Label>
        <Input id="name" value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} /></div>
      <div><Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" type="email" value={state.email} onChange={(e) => setState({ ...state, email: e.target.value })} /></div>
      <div><Label htmlFor="password">Contraseña</Label>
        <Input id="password" type="password" value={state.password} onChange={(e) => setState({ ...state, password: e.target.value })} /></div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="h-12 font-extrabold mt-2">Crear cuenta</Button>
    </form>
  )
}
