import { test, expect } from '@playwright/test'

test('recurrencia: crear regla, ver la ocurrencia y confirmarla', async ({ page }) => {
  const email = `e2e_rec_${Date.now()}@growly.app`
  // registro
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Rec')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // cuenta con saldo inicial
  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  // nueva recurrencia mensual con primera fecha = hoy (default del diálogo)
  await page.goto('/movimientos?vista=recurrentes')
  await page.getByRole('button', { name: 'Nueva recurrencia' }).click()
  await page.getByLabel('Importe').fill('16')
  await page.getByLabel('Descripción').fill('Netflix')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(/Cada mes/)).toBeVisible()

  // en la vista Movimientos, la ocurrencia de hoy aparece como PENDING
  // (con fecha = hoy a medianoche UTC queda <= ahora → "Vencido" y confirmable)
  // Nota: la materialización pre-genera ocurrencias dentro del horizonte de 90 días
  // (lib/recurring.ts HORIZON_DAYS), así que una regla MONTHLY creada hoy produce
  // varias filas "Netflix" (hoy + futuras) → .first() por strict mode.
  await page.goto('/movimientos')
  await expect(page.getByText('Netflix').first()).toBeVisible()
  await expect(page.getByText('Vencido')).toBeVisible()

  // confirmar → CLEARED → el saldo de la cuenta baja
  await page.getByRole('button', { name: 'Confirmar' }).first().click()
  await expect(page.getByText('Vencido')).not.toBeVisible()
  await page.goto('/cuentas')
  // aparece en la fila de la cuenta y en el patrimonio neto → .first() por strict mode
  await expect(page.getByText('$984.00').first()).toBeVisible()
})
