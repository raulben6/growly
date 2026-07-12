import { describe, it, expect } from 'vitest'
import {
  parseMonthParam, monthParam, monthLabel, prevMonth, nextMonth, isCurrentMonth,
} from '@/lib/month-param'

const now = new Date(2026, 6, 11) // 11 jul 2026

describe('parseMonthParam', () => {
  it('convierte mes humano 1-12 a 0-11', () => {
    expect(parseMonthParam('2026-07', now)).toEqual({ year: 2026, month: 6 })
    expect(parseMonthParam('2025-01', now)).toEqual({ year: 2025, month: 0 })
    expect(parseMonthParam('2025-12', now)).toEqual({ year: 2025, month: 11 })
  })
  it('ausente o inválido → mes actual', () => {
    const current = { year: 2026, month: 6 }
    expect(parseMonthParam(undefined, now)).toEqual(current)
    expect(parseMonthParam('garbage', now)).toEqual(current)
    expect(parseMonthParam('2026-13', now)).toEqual(current)
    expect(parseMonthParam('2026-00', now)).toEqual(current)
    expect(parseMonthParam('2026-7', now)).toEqual(current) // exige dos dígitos
  })
})

describe('monthParam / monthLabel', () => {
  it('formatea de vuelta a 1-12 con dos dígitos', () => {
    expect(monthParam({ year: 2026, month: 6 })).toBe('2026-07')
    expect(monthParam({ year: 2025, month: 11 })).toBe('2025-12')
  })
  it('etiqueta en español', () => {
    expect(monthLabel({ year: 2026, month: 6 })).toBe('Julio 2026')
    expect(monthLabel({ year: 2026, month: 0 })).toBe('Enero 2026')
  })
})

describe('prevMonth / nextMonth', () => {
  it('navega dentro del año', () => {
    expect(prevMonth({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 5 })
    expect(nextMonth({ year: 2026, month: 6 })).toEqual({ year: 2026, month: 7 })
  })
  it('cruza el cambio de año', () => {
    expect(prevMonth({ year: 2026, month: 0 })).toEqual({ year: 2025, month: 11 })
    expect(nextMonth({ year: 2025, month: 11 })).toEqual({ year: 2026, month: 0 })
  })
})

describe('isCurrentMonth', () => {
  it('compara contra now', () => {
    expect(isCurrentMonth({ year: 2026, month: 6 }, now)).toBe(true)
    expect(isCurrentMonth({ year: 2026, month: 5 }, now)).toBe(false)
    expect(isCurrentMonth({ year: 2025, month: 6 }, now)).toBe(false)
  })
})
