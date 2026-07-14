import { test, expect } from '@playwright/test'

test('reportes: ingreso + gasto de hoy se reflejan en /reportes y el dashboard', async ({ page }) => {
  const email = `e2e_rep_${Date.now()}@growly.app`
  const now = new Date()
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // registro
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Rep')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // cuenta
  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  // ingreso de $3,000 hoy
  await page.goto('/movimientos')
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByRole('button', { name: 'Ingreso' }).click()
  await page.getByLabel('Importe').fill('3000')
  await page.getByLabel('Descripción').fill('Nómina')
  await page.getByLabel('Fecha').fill(hoy)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Nómina')).toBeVisible()

  // gasto de $600 hoy en Alimentación
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByLabel('Importe').fill('600')
  await page.getByLabel('Descripción').fill('Súper')
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimentación' })
  await page.getByLabel('Fecha').fill(hoy)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Súper')).toBeVisible()

  // /reportes: chart, tasa de ahorro (3000−600)/3000 = 80% y top categorías
  await page.goto('/reportes')
  await expect(page.getByText('Ingresos vs Gastos')).toBeVisible()
  await expect(page.getByText('80%')).toBeVisible()
  await expect(page.getByText('Alimentación')).toBeVisible()

  // dashboard: flujo de caja visible
  await page.goto('/')
  await expect(page.getByText('Flujo de caja')).toBeVisible()
})
