import { test, expect } from '@playwright/test'

test('alerta de presupuesto: 86% → campana → centro → marcar leída', async ({ page }) => {
  const email = `e2e_notif_${Date.now()}@growly.app`
  const now = new Date()
  const hoy = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  // registro + cuenta
  await page.goto('/register')
  await page.getByLabel('Nombre completo').fill('E2E Notif')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill('supersecret')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('http://localhost:3000/')

  await page.goto('/cuentas')
  await page.getByRole('button', { name: /Añadir cuenta/i }).click()
  await page.getByLabel('Nombre').fill('Corriente')
  await page.getByLabel('Saldo inicial').fill('1000')
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page.getByText('Corriente')).toBeVisible()

  // presupuesto Alimentación $1,000
  await page.goto('/presupuesto')
  await page.getByRole('button', { name: /Añadir categoría/i }).click()
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimentación' })
  await page.getByLabel('Límite mensual').fill('1000')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText(/Gastado de/)).toBeVisible()

  // gasto de $860 hoy → 86%
  await page.goto('/movimientos')
  await page.getByRole('button', { name: 'Añadir movimiento' }).click()
  await page.getByLabel('Importe').fill('860')
  await page.getByLabel('Descripción').fill('Súper')
  await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Alimentación' })
  await page.getByLabel('Fecha').fill(hoy)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('Súper')).toBeVisible()

  // el centro evalúa y muestra la alerta
  await page.goto('/notificaciones')
  await expect(page.getByText('Cerca del límite de presupuesto')).toBeVisible()
  await expect(page.getByText(/Llevas el 86% de tu presupuesto de/)).toBeVisible()
  await expect(page.getByRole('link', { name: /No leídas · 1/ })).toBeVisible()

  // el badge de la campana la refleja
  await page.goto('/')
  await expect(page.getByTestId('bell-badge')).toHaveText('1')

  // volver por la campana y marcar leída → badge desaparece
  await page.getByRole('link', { name: /Notificaciones/ }).click()
  await expect(page).toHaveURL(/\/notificaciones/)
  await page.getByRole('button', { name: /Cerca del límite/ }).click()
  await expect(page.getByTestId('bell-badge')).toHaveCount(0)
  await expect(page.getByRole('link', { name: /No leídas · 0/ })).toBeVisible()
})
