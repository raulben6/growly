import { test, expect } from '@playwright/test'

test('el dashboard refleja el saldo de una cuenta nueva', async ({ page }) => {
  const email = `e2e_dash_${Date.now()}@growly.app`
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Dash')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('2000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText('Saldo disponible')).toBeVisible()
  await expect(page.getByText('$2,000.00').first()).toBeVisible()
})
