import { describe, it, expect } from 'vitest'
import { formatMoney, toCents, fromCents, parseAmountToCents } from '@/lib/money'

describe('formatMoney', () => {
  it('formatea con centavos y separador de miles', () => {
    expect(formatMoney(1824000)).toBe('$18,240.00')
  })
  it('omite centavos con withCents:false', () => {
    expect(formatMoney(1824000, { withCents: false })).toBe('$18,240')
  })
  it('devuelve la magnitud (sin signo) para negativos', () => {
    expect(formatMoney(-6230)).toBe('$62.30')
  })
  it('respeta otra moneda', () => {
    expect(formatMoney(100000, { currency: 'EUR' })).toBe('€1,000.00')
  })
})

describe('toCents / fromCents', () => {
  it('convierte a centavos redondeando', () => {
    expect(toCents(62.3)).toBe(6230)
    expect(toCents(0.1 + 0.2)).toBe(30) // sin errores de coma flotante
  })
  it('convierte desde centavos', () => {
    expect(fromCents(6230)).toBe(62.3)
  })
})

describe('parseAmountToCents', () => {
  it('parsea con símbolo y comas', () => {
    expect(parseAmountToCents('$1,234.56')).toBe(123456)
    expect(parseAmountToCents('62.3')).toBe(6230)
  })
  it('rechaza entradas inválidas', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('-5')).toBeNull()
  })
})
