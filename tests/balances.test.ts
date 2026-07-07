import { describe, it, expect } from 'vitest'
import {
  accountBalance, cardUsed, cardUtilization, netWorth,
  type AccountInput, type TxInput,
} from '@/lib/balances'

const checking: AccountInput = { id: 'a1', type: 'CHECKING', initialBalance: 1000000 } // $10,000
const savings: AccountInput = { id: 'a2', type: 'SAVINGS', initialBalance: 800000 }   // $8,000
const card: AccountInput = { id: 'c1', type: 'CREDIT_CARD', initialBalance: 0, creditLimit: 300000 } // límite $3,000

describe('accountBalance', () => {
  it('suma ingresos y resta gastos (solo CLEARED)', () => {
    const txns: TxInput[] = [
      { type: 'INCOME', amount: 306000, accountId: 'a1', status: 'CLEARED' },
      { type: 'EXPENSE', amount: 6230, accountId: 'a1', status: 'CLEARED' },
      { type: 'EXPENSE', amount: 120000, accountId: 'a1', status: 'PENDING' }, // ignorado
    ]
    expect(accountBalance(checking, txns)).toBe(1000000 + 306000 - 6230)
  })
  it('aplica transferencias en ambas cuentas', () => {
    const txns: TxInput[] = [
      { type: 'TRANSFER', amount: 50000, accountId: 'a1', transferAccountId: 'a2' },
    ]
    expect(accountBalance(checking, txns)).toBe(1000000 - 50000)
    expect(accountBalance(savings, txns)).toBe(800000 + 50000)
  })
})

describe('tarjeta de crédito', () => {
  it('cardUsed = gastos − pagos', () => {
    const txns: TxInput[] = [
      { type: 'EXPENSE', amount: 64000, accountId: 'c1' },           // gasto $640
      { type: 'TRANSFER', amount: 20000, accountId: 'a1', transferAccountId: 'c1' }, // pago $200
    ]
    expect(cardUsed(card, txns)).toBe(64000 - 20000) // $440
  })
  it('cardUtilization calcula disponible y porcentaje', () => {
    const txns: TxInput[] = [{ type: 'EXPENSE', amount: 150000, accountId: 'c1' }] // $1,500 de $3,000
    expect(cardUtilization(card, txns)).toEqual({ used: 150000, available: 150000, pct: 50 })
  })
})

describe('netWorth', () => {
  it('suma cuentas y resta deuda de tarjetas', () => {
    const txns: TxInput[] = [{ type: 'EXPENSE', amount: 64000, accountId: 'c1' }] // deuda $640
    // checking $10,000 + savings $8,000 - deuda $640 = $17,360
    expect(netWorth([checking, savings, card], txns)).toBe(1000000 + 800000 - 64000)
  })
})
