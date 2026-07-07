'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { LogoMark } from '@/components/growly/logo'

export default function LoginPage() {
  const router = useRouter()
  const [state, setState] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null)
    const res = await signIn('credentials', { ...state, redirect: false })
    if (res?.error) { setError('Correo o contraseña incorrectos'); setLoading(false); return }
    router.push('/')
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="mb-3"><LogoMark size={52} /></div>
      <h1 className="text-[27px] font-extrabold tracking-[-0.02em]">Bienvenido de nuevo</h1>
      <p className="text-sm text-muted-foreground mb-3">Inicia sesión para continuar</p>
      <div><Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" type="email" value={state.email} onChange={(e) => setState({ ...state, email: e.target.value })} /></div>
      <div><Label htmlFor="password">Contraseña</Label>
        <Input id="password" type="password" value={state.password} onChange={(e) => setState({ ...state, password: e.target.value })} /></div>
      <Link href="/forgot-password" className="text-right text-sm font-bold text-acc">¿Olvidaste tu contraseña?</Link>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading} className="h-12 font-extrabold">Entrar</Button>
      <Button type="button" variant="secondary" className="h-12" onClick={() => signIn('google', { callbackUrl: '/' })}>Google</Button>
      <p className="text-center text-sm text-muted-foreground">¿No tienes cuenta? <Link href="/register" className="text-acc font-bold">Regístrate</Link></p>
    </form>
  )
}
