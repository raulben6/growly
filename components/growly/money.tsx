import { formatMoney } from '@/lib/money'
import { cn } from '@/lib/utils'

export function Money({
  cents,
  withCents = true,
  currency = 'USD',
  signed = false,
  className,
}: {
  cents: number
  withCents?: boolean
  currency?: string
  signed?: boolean
  className?: string
}) {
  const prefix = signed && cents < 0 ? '−' : ''
  return (
    <span className={className}>
      {prefix}
      {formatMoney(cents, { withCents, currency })}
    </span>
  )
}

export function SignedAmount({
  cents,
  currency = 'USD',
  className,
}: {
  cents: number
  currency?: string
  className?: string
}) {
  const positive = cents >= 0
  const glyph = positive ? '+' : '−' // U+2212 minus, coherente con los diseños
  return (
    <span className={cn(positive ? 'text-acc' : 'text-foreground', className)}>
      {glyph}
      {formatMoney(cents, { currency })}
    </span>
  )
}
