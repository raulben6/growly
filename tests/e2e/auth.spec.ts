import { test, expect } from '@playwright/test'

test('registro redirige al dashboard', async ({ page }) => {
  const email = `e2e_${Date.now()}@growly.app`
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E User')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.goto('http://localhost:3000/api/auth/session')
  const json = JSON.parse((await page.locator('body').textContent()) ?? '{}')
  expect(typeof json.user?.id).toBe('string')
  expect(json.user.id.length).toBeGreaterThan(0)
})
