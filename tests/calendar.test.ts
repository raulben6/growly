import { describe, it, expect } from 'vitest'
import {
  calendarEvents, calendarMonthTotals, dayDotTone, monthGridDays, agendaDayLabel,
  daysInMonth, shortMonthName, type CalTx, type CalCard, type CalendarEvent,
} from '@/lib/calendar'

const d = (day: number) => new Date(Date.UTC(2026, 6, day))

const tx = (over: Partial<CalTx>): CalTx => ({
  id: 'x', type: 'EXPENSE', amount: 10_000, description: 'Gasto', date: d(5),
  status: 'CLEARED', categoryName: 'Casa', categoryIcon: 'home', ...over,
})

const visa: CalCard = { name: 'Visa', type: 'CREDIT_CARD', archived: false, statementDay: 15, dueDay: 31 }

describe('calendarEvents', () => {
  it('agrupa movimientos del mes por día UTC con meta según estado', () => {
    const map = calendarEvents(
      [
        tx({ id: 'a', date: d(5) }),
        tx({ id: 'b', date: d(5), type: 'INCOME', description: 'Nómina', categoryName: 'Sueldo' }),
        tx({ id: 'c', date: d(20), status: 'PENDING', description: 'Alquiler' }),
        tx({ id: 'fuera', date: new Date(Date.UTC(2026, 5, 30)) }),
      ],
      [], 2026, 6,
    )
    expect(map.get(5)!.map((e) => e.kind)).toEqual(['expense', 'income'])
    expect(map.get(5)![0].meta).toBe('Casa')
    expect(map.get(5)![1].meta).toBe('Sueldo')
    expect(map.get(20)![0]).toMatchObject({ kind: 'expense', meta: 'Pago programado', pending: true, label: 'Alquiler' })
    expect(map.has(30)).toBe(false)
  })

  it('TRANSFER se muestra como expense con meta Transferencia', () => {
    const map = calendarEvents([tx({ type: 'TRANSFER', description: 'A ahorro' })], [], 2026, 6)
    expect(map.get(5)![0]).toMatchObject({ kind: 'expense', meta: 'Transferencia' })
  })

  it('tarjeta activa genera corte y pago; el día 31 se ajusta al último día del mes', () => {
    // junio 2026 tiene 30 días → dueDay 31 cae el 30
    const map = calendarEvents([], [visa], 2026, 5)
    expect(map.get(15)![0]).toMatchObject({ kind: 'card', label: 'Corte · Visa', meta: 'Corte de tarjeta', pending: false })
    expect(map.get(30)![0]).toMatchObject({ kind: 'card', label: 'Pago tarjeta · Visa', meta: 'Pago de tarjeta' })
    expect(map.get(15)![0].amount).toBeUndefined()
  })

  it('febrero no bisiesto: día 31 → 28', () => {
    const map = calendarEvents([], [visa], 2026, 1)
    expect(map.get(28)!.some((e) => e.label === 'Pago tarjeta · Visa')).toBe(true)
  })

  it('ignora tarjetas archivadas y cuentas no-tarjeta', () => {
    const map = calendarEvents(
      [],
      [
        { ...visa, archived: true },
        { name: 'Corriente', type: 'CHECKING', statementDay: 10, dueDay: 20 },
      ],
      2026, 6,
    )
    expect(map.size).toBe(0)
  })
})

describe('calendarMonthTotals', () => {
  it('cuenta CLEARED y PENDING; ignora TRANSFER y otros meses', () => {
    expect(
      calendarMonthTotals(
        [
          tx({ type: 'INCOME', amount: 300_000 }),
          tx({ amount: 90_000 }),
          tx({ amount: 50_000, status: 'PENDING' }),
          tx({ type: 'TRANSFER', amount: 70_000 }),
          tx({ amount: 99_000, date: new Date(Date.UTC(2026, 5, 30)) }),
        ],
        2026, 6,
      ),
    ).toEqual({ income: 300_000, expense: 140_000 })
  })
})

describe('dayDotTone', () => {
  const ev = (kind: CalendarEvent['kind']): CalendarEvent =>
    ({ kind, date: d(1), label: '', meta: '', icon: null, pending: false })
  it('prioridad rojo > verde > gris', () => {
    expect(dayDotTone([ev('card'), ev('income'), ev('expense')])).toBe('expense')
    expect(dayDotTone([ev('card'), ev('income')])).toBe('income')
    expect(dayDotTone([ev('card')])).toBe('card')
    expect(dayDotTone([])).toBeNull()
  })
})

describe('monthGridDays', () => {
  it('julio 2026 empieza miércoles: 2 huecos y padding a múltiplo de 7', () => {
    const cells = monthGridDays(2026, 6)
    expect(cells.slice(0, 3)).toEqual([null, null, 1])
    expect(cells.length % 7).toBe(0)
    expect(cells.filter((c) => c !== null).length).toBe(31)
    expect(cells[cells.length - 1]).toBeNull()
  })
  it('febrero 2026 empieza domingo: 6 huecos', () => {
    const cells = monthGridDays(2026, 1)
    expect(cells.slice(0, 7)).toEqual([null, null, null, null, null, null, 1])
    expect(cells.filter((c) => c !== null).length).toBe(28)
  })
})

describe('agendaDayLabel / daysInMonth / shortMonthName', () => {
  it('etiqueta día de semana UTC + día + mes corto', () => {
    expect(agendaDayLabel(2026, 6, 6)).toBe('LUNES · 6 JUL')
    expect(agendaDayLabel(2026, 6, 12)).toBe('DOMINGO · 12 JUL')
  })
  it('daysInMonth y shortMonthName', () => {
    expect(daysInMonth(2026, 6)).toBe(31)
    expect(daysInMonth(2026, 1)).toBe(28)
    expect(daysInMonth(2028, 1)).toBe(29)
    expect(shortMonthName(6)).toBe('jul')
  })
})
