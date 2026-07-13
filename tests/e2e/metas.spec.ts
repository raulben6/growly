import { test, expect } from '@playwright/test'

test('metas: crear meta, aportar y ver el progreso', async ({ page }) => {
  const email = `e2e_meta_${Date.now()}@growly.app`

  // registro
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Meta')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // estado vacío → nueva meta
  await page.goto('/metas')
  await expect(page.getByText(/Crea tu primera meta/)).toBeVisible()
  await page.getByRole('button', { name: /Nueva meta/i }).click()
  await page.getByLabel('Nombre').fill('Viaje a Japón')
  await page.getByRole('button', { name: '✈️' }).click()
  await page.getByLabel('Importe objetivo').fill('5000')
  await page.getByRole('button', { name: 'Guardar' }).click()

  // tarjeta visible con 0%
  await expect(page.getByText('Viaje a Japón')).toBeVisible()
  await expect(page.getByText('0% completado')).toBeVisible()
  await expect(page.getByText('Total ahorrado en metas')).toBeVisible()

  // aportar $2,400 → 48%
  await page.getByRole('button', { name: /Aportar/ }).click()
  await page.getByLabel('Importe').fill('2400')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('48% completado')).toBeVisible()
  // hero refleja el total (aparece también en la tarjeta → .first())
  await expect(page.getByText('$2,400').first()).toBeVisible()

  // dashboard muestra el card de metas
  await page.goto('/')
  await expect(page.getByText('Metas de ahorro')).toBeVisible()
  await expect(page.getByText('48%')).toBeVisible()
})
