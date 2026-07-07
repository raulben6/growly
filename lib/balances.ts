export type AccountType = 'CHECKING' | 'SAVINGS' | 'CASH' | 'CREDIT_CARD'

export type AccountInput = {
  id: string
  type: AccountType
  initialBalance: number       // centavos
  creditLimit?: number | null  // centavos, solo tarjetas
}

export type TxInput = {
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER'
  amount: number               // centavos, positivo
  accountId: string
  transferAccountId?: string | null
  status?: 'CLEARED' | 'PENDING'
}

const isCleared = (t: TxInput) => t.status !== 'PENDING'

export function accountBalance(account: AccountInput, txns: TxInput[]): number {
  let balance = account.initialBalance
  for (const t of txns) {
    if (!isCleared(t)) continue
    if (t.accountId === account.id) {
      if (t.type === 'INCOME') balance += t.amount
      else balance -= t.amount // EXPENSE o TRANSFER saliente
    } else if (t.type === 'TRANSFER' && t.transferAccountId === account.id) {
      balance += t.amount // transferencia entrante
    }
  }
  return balance
}

export function cardUsed(card: AccountInput, txns: TxInput[]): number {
  let used = card.initialBalance
  for (const t of txns) {
    if (!isCleared(t)) continue
    if (t.type === 'EXPENSE' && t.accountId === card.id) used += t.amount
    else if (t.type === 'TRANSFER' && t.transferAccountId === card.id) used -= t.amount // pago
  }
  return used
}

export function cardUtilization(
  card: AccountInput,
  txns: TxInput[],
): { used: number; available: number; pct: number } {
  const used = cardUsed(card, txns)
  const limit = card.creditLimit ?? 0
  const available = limit - used
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0
  return { used, available, pct }
}

export function netWorth(accounts: AccountInput[], txns: TxInput[]): number {
  let total = 0
  for (const a of accounts) {
    if (a.type === 'CREDIT_CARD') total -= cardUsed(a, txns)
    else total += accountBalance(a, txns)
  }
  return total
}
