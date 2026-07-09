import { describe, it, expect } from 'vitest'
import {
  nextOccurrences, nextDateForRule, describeFrequency, addDaysUTC, formatShortDateUTC,
  type RecurrenceRuleInput,
} from '@/lib/recurrence'

const d = (s: string) => new Date(s) // 'YYYY-MM-DD' → medianoche UTC
const rule = (frequency: RecurrenceRuleInput['frequency'], start: string, end?: string): RecurrenceRuleInput =>
  ({ frequency, startDate: d(start), endDate: end ? d(end) : null })

describe('nextOccurrences', () => {
  it('MONTHLY normal: mismo día cada mes', () => {
    expect(nextOccurrences(rule('MONTHLY', '2026-01-15'), d('2025-12-31'), d('2026-03-31')))
      .toEqual([d('2026-01-15'), d('2026-02-15'), d('2026-03-15')])
  })

  it('MONTHLY anclada al 31: se ajusta al último día del mes sin deslizarse', () => {
    expect(nextOccurrences(rule('MONTHLY', '2026-01-31'), d('2026-01-01'), d('2026-04-30')))
      .toEqual([d('2026-01-31'), d('2026-02-28'), d('2026-03-31'), d('2026-04-30')])
  })

  it('MONTHLY anclada al 31 en año bisiesto: 29 feb', () => {
    expect(nextOccurrences(rule('MONTHLY', '2024-01-31'), d('2024-01-01'), d('2024-02-29')))
      .toEqual([d('2024-01-31'), d('2024-02-29')])
  })

  it('YEARLY anclada al 29 feb: en años no bisiestos cae el 28', () => {
    expect(nextOccurrences(rule('YEARLY', '2024-02-29'), d('2024-01-01'), d('2028-12-31')))
      .toEqual([d('2024-02-29'), d('2025-02-28'), d('2026-02-28'), d('2027-02-28'), d('2028-02-29')])
  })

  it('WEEKLY: cada 7 días', () => {
    expect(nextOccurrences(rule('WEEKLY', '2026-07-06'), d('2026-07-01'), d('2026-07-21')))
      .toEqual([d('2026-07-06'), d('2026-07-13'), d('2026-07-20')])
  })

  it('BIWEEKLY: cada 14 días', () => {
    expect(nextOccurrences(rule('BIWEEKLY', '2026-07-06'), d('2026-07-01'), d('2026-08-04')))
      .toEqual([d('2026-07-06'), d('2026-07-20'), d('2026-08-03')])
  })

  it('endDate es inclusive', () => {
    expect(nextOccurrences(rule('MONTHLY', '2026-01-15', '2026-02-15'), d('2026-01-01'), d('2026-06-30')))
      .toEqual([d('2026-01-15'), d('2026-02-15')])
  })

  it('fromExclusive excluye la ocurrencia exacta', () => {
    expect(nextOccurrences(rule('MONTHLY', '2026-01-15'), d('2026-01-15'), d('2026-02-28')))
      .toEqual([d('2026-02-15')])
  })

  it('rango sin ocurrencias → []', () => {
    expect(nextOccurrences(rule('MONTHLY', '2026-06-01'), d('2026-01-01'), d('2026-05-31'))).toEqual([])
  })
})

describe('nextDateForRule', () => {
  it('devuelve la primera ocurrencia futura', () => {
    expect(nextDateForRule(rule('MONTHLY', '2026-01-15'), d('2026-03-20'))).toEqual(d('2026-04-15'))
  })
  it('null si la serie terminó (endDate)', () => {
    expect(nextDateForRule(rule('MONTHLY', '2026-01-15', '2026-03-15'), d('2026-03-20'))).toBeNull()
  })
})

describe('describeFrequency', () => {
  it('etiquetas en español', () => {
    expect(describeFrequency(rule('MONTHLY', '2026-07-12'))).toBe('Cada mes · día 12')
    expect(describeFrequency(rule('WEEKLY', '2026-07-06'))).toBe('Cada semana · lunes')
    expect(describeFrequency(rule('BIWEEKLY', '2026-07-06'))).toBe('Cada 2 semanas · lunes')
    expect(describeFrequency(rule('YEARLY', '2026-12-24'))).toBe('Cada año · 24 dic')
  })
})

describe('helpers', () => {
  it('addDaysUTC suma días', () => {
    expect(addDaysUTC(d('2026-07-08'), 90)).toEqual(d('2026-10-06'))
  })
  it('formatShortDateUTC', () => {
    expect(formatShortDateUTC(d('2026-08-12'))).toBe('12 ago')
  })
})
