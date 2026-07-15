import { describe, it, expect } from 'vitest'
import { alertCandidates, nextCardDueDate, relativeTimeLabel, type AlertInput } from '@/lib/alerts'

// Ancla a mediodía LOCAL: portable para offsets -12..+11 y estable en las comparaciones
// de instantes contra fechas-calendario UTC.
const now = new Date(2026, 6, 12, 12) // 12 jul 2026, 12:00 local

const empty: AlertInput = { budget: null, pendingTxns: [], cards: [] }
const d = (day: number) => new Date(Date.UTC(2026, 6, day))

describe('alertCandidates · presupuesto', () => {
  const budget = (pct: number) => ({ ...empty, budget: { pct, spent: pct * 1_000, limit: 100_000 } })
  it('84 → nada; 85 y 100 → WARN; 101 → OVER (sin WARN)', () => {
    expect(alertCandidates(budget(84), now)).toEqual([])
    expect(alertCandidates(budget(85), now)).toMatchObject([
      { type: 'BUDGET_WARN', dedupeKey: 'budget-85-2026-07', body: 'Llevas el 85% de tu presupuesto de julio.' },
    ])
    expect(alertCandidates(budget(100), now)[0].type).toBe('BUDGET_WARN')
    const over = alertCandidates(budget(101), now)
    expect(over).toHaveLength(1)
    expect(over[0]).toMatchObject({
      type: 'BUDGET_OVER',
      title: 'Presupuesto de julio superado',
      dedupeKey: 'budget-over-2026-07',
      body: 'Llevas el 101% del límite ($1,010 de $1,000).',
    })
  })
  it('sin presupuesto → nada', () => {
    expect(alertCandidates(empty, now)).toEqual([])
  })
})

describe('alertCandidates · pagos PENDING', () => {
  const withTx = (date: Date): AlertInput => ({
    ...empty,
    pendingTxns: [{ id: 't1', description: 'Alquiler', amount: 120_000, date }],
  })
  it('mañana → DUE singular; en 3 días → DUE; en 4 → nada; hoy medianoche UTC → OVERDUE', () => {
    expect(alertCandidates(withTx(d(13)), now)).toMatchObject([
      { type: 'PAYMENT_DUE', dedupeKey: 'tx-due-t1', body: 'Alquiler ($1,200.00) vence en 1 día.' },
    ])
    expect(alertCandidates(withTx(d(15)), now)[0].body).toContain('vence en 3 días')
    expect(alertCandidates(withTx(d(16)), now)).toEqual([])
    expect(alertCandidates(withTx(d(12)), now)).toMatchObject([
      { type: 'PAYMENT_OVERDUE', dedupeKey: 'tx-overdue-t1', title: 'Pago vencido' },
    ])
  })
})

describe('alertCandidates · tarjetas', () => {
  const withCard = (dueDay: number | null, used = 64_000): AlertInput => ({
    ...empty,
    cards: [{ id: 'a1', name: 'Visa', dueDay, used }],
  })
  it('dueDay a 3 días → CARD_DUE con clave del mes del vencimiento', () => {
    expect(alertCandidates(withCard(15), now)).toMatchObject([
      {
        type: 'CARD_DUE',
        dedupeKey: 'card-due-a1-2026-07',
        body: 'El pago de Visa ($640) vence el 15 de julio.',
      },
    ])
  })
  it('a 6 días → nada; dueDay ya pasado → mes siguiente (lejos) → nada; hoy → CARD_DUE', () => {
    expect(alertCandidates(withCard(18), now)).toEqual([])
    expect(alertCandidates(withCard(10), now)).toEqual([]) // 10 ago: a 29 días
    expect(alertCandidates(withCard(12), now)[0].type).toBe('CARD_DUE')
  })
  it('sin saldo usado o sin dueDay → nada', () => {
    expect(alertCandidates(withCard(15, 0), now)).toEqual([])
    expect(alertCandidates(withCard(null), now)).toEqual([])
  })
  it('ajuste fin de mes: dueDay 31 en junio → 30 jun', () => {
    const juneNow = new Date(2026, 5, 28, 12)
    expect(alertCandidates(withCard(31), juneNow)).toMatchObject([
      { dedupeKey: 'card-due-a1-2026-06', body: 'El pago de Visa ($640) vence el 30 de junio.' },
    ])
  })
})

describe('nextCardDueDate', () => {
  it('este mes si no ha pasado; si pasó, el siguiente (con ajuste)', () => {
    expect(nextCardDueDate(15, now)).toEqual({ year: 2026, month: 6, day: 15 })
    expect(nextCardDueDate(10, now)).toEqual({ year: 2026, month: 7, day: 10 })
    expect(nextCardDueDate(31, new Date(2026, 5, 28, 12))).toEqual({ year: 2026, month: 5, day: 30 })
    expect(nextCardDueDate(31, new Date(2026, 11, 31, 12))).toEqual({ year: 2026, month: 11, day: 31 })
  })
})

describe('relativeTimeLabel', () => {
  it('ahora / minutos / horas / ayer / fecha', () => {
    expect(relativeTimeLabel(new Date(now.getTime() - 30_000), now)).toBe('Ahora')
    expect(relativeTimeLabel(new Date(now.getTime() - 5 * 60_000), now)).toBe('Hace 5 min')
    expect(relativeTimeLabel(new Date(2026, 6, 12, 9), now)).toBe('Hace 3 h')
    expect(relativeTimeLabel(new Date(2026, 6, 11, 20), now)).toBe('Ayer')
    expect(relativeTimeLabel(new Date(2026, 6, 3, 9), now)).toBe('3 jul')
  })
})
