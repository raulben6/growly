import { test, expect } from '@playwright/test'

test('calendario: un gasto de hoy aparece en la agenda y en los chips', async ({ page }) => {
  const email = `e2e_cal_${Date.now()}@growly.app`
  // fecha local de hoy (día de calendario del usuario) para el input date
  const now = new Date()
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // registro
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Cal')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // cuenta + gasto de hoy
  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  await page.goto('/movimientos')
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByLabel('Importe').fill('45.50')
  await page.getByLabel('Descripción').fill('Cine')
  await page.getByLabel('Fecha').fill(hoy)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Cine')).toBeVisible()

  // al calendario desde el sidebar; hoy está seleccionado por defecto
  await page.getByRole('link', { name: 'Calendario' }).click()
  await expect(page).toHaveURL(/\/calendario/)
  await expect(page.getByText('Cine')).toBeVisible()
  await expect(page.getByText(/Pagos/)).toBeVisible()
  await expect(page.getByText('−$45.50')).toBeVisible()

  // al navegar de mes, la selección vuelve al default (día 1 en mes no actual)
  await page.getByLabel('Mes anterior').click()
  await expect(page.getByText(/· 1 [A-ZÁÉÍÓÚ]{3}/)).toBeVisible()
})
