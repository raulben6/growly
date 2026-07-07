import { test, expect } from '@playwright/test'

test('añadir un gasto y verlo en Movimientos', async ({ page }) => {
  const email = `e2e_mov_${Date.now()}@growly.app`
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Mov')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // crear una cuenta primero (para asignar el gasto)
  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  // añadir un gasto
  await page.goto('/movimientos')
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByLabel('Importe').fill('62.30')
  await page.getByLabel('Descripción').fill('Mercadona')
  await page.getByLabel('Fecha').fill('2026-07-06')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByText('Mercadona')).toBeVisible()
  await expect(page.getByText('−$62.30')).toBeVisible()
})
