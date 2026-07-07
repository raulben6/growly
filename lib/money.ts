export function formatMoney(
  cents: number,
  opts: { withCents?: boolean; currency?: string } = {},
): string {
  const { withCents = true, currency = 'USD' } = opts
  const value = Math.abs(cents) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  }).format(value)
}

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[^0-9.]/g, '') // quita símbolos, comas, espacios, signos
  if (cleaned === '' || input.trim().startsWith('-')) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}
