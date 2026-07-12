import { test, expect } from '@playwright/test'

test('presupuesto: crear límite, ver progreso con un gasto y card del dashboard', async ({ page }) => {
  const email = `e2e_pre_${Date.now()}@growly.app`
  // fecha local de hoy en formato del input date.
  // Nota: al inicio de mes con offset UTC negativo el gasto podría caer en el mes
  // anterior por la convención de fechas pendiente de unificar (backlog pre-C4).
  const now = new Date()
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // registro
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Pre')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  // cuenta para el gasto
  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  // estado vacío → crear presupuesto de Alimentación $1,000
  await page.goto('/presupuesto')
  await expect(page.getByText(/Crea tu primer presupuesto/)).toBeVisible()
  await page.getByRole('button', { name: /Añadir categoría/i }).click()
  // exact: true evita colisionar con el diálogo "Añadir categoría" (mismo texto
  // parcial vía aria-labelledby del título) — strict mode violation detectada al correr el test.
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimentación' })
  await page.getByLabel('Límite mensual').fill('1000')
  await page.getByRole('button', { name: 'Guardar' }).click()

  // hero y fila de la categoría visibles
  await expect(page.getByText(/Gastado de/)).toBeVisible()
  await expect(page.getByText('Alimentación')).toBeVisible()
  await expect(page.getByText('0% del presupuesto usado', { exact: false })).toBeVisible()

  // gasto de $250 en Alimentación hoy (CLEARED)
  await page.goto('/movimientos')
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByLabel('Importe').fill('250')
  await page.getByLabel('Descripción').fill('Súper')
  await page.getByLabel('Categoría').selectOption({ label: 'Alimentación' })
  await page.getByLabel('Fecha').fill(hoy)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Súper')).toBeVisible()

  // /presupuesto refleja el gasto: 250/1000 = 25%
  await page.goto('/presupuesto')
  await expect(page.getByText(/25% del presupuesto usado/)).toBeVisible()

  // el dashboard muestra el card con el badge del 25%
  await page.goto('/')
  await expect(page.getByText('25%').first()).toBeVisible()
})
