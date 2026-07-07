import { test, expect } from '@playwright/test'

test('crear una cuenta y verla en /cuentas con el patrimonio actualizado', async ({ page }) => {
  // usuario fresco para estado limpio
  const email = `e2e_cuentas_${Date.now()}@growly.app`
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Cuentas')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Efectivo')
  await page.getByLabel('Saldo inicial').fill('1500')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()

  await expect(page.getByText('Efectivo')).toBeVisible()
  await expect(page.getByText('$1,500.00').first()).toBeVisible()
})
