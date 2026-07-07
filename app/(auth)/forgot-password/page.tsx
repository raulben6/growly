'use client'
import { useState } from 'react'
import { requestPasswordReset } from '@/lib/auth-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  async function onSubmit(e: React.FormEvent) { e.preventDefault(); await requestPasswordReset(email); setSent(true) }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <h1 className="text-[27px] font-extrabold tracking-[-0.02em]">¿Olvidaste tu contraseña?</h1>
      <p className="text-sm text-muted-foreground mb-3">Ingresa tu correo y te enviaremos un enlace para restablecerla.</p>
      <div><Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      {sent && <p className="text-sm text-success">Si el correo existe, te enviamos un enlace.</p>}
      <Button type="submit" className="h-12 font-extrabold">Enviar enlace</Button>
      <p className="text-center text-sm"><Link href="/login" className="text-acc font-bold">Inicia sesión</Link></p>
    </form>
  )
}
