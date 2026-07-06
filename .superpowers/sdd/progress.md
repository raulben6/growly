# Progreso — Growly Fase 0 (Fundaciones)

Plan: docs/superpowers/plans/2026-07-05-growly-fase-0-fundaciones.md
Rama: feature/fase-0-fundaciones

## Tareas
- [x] Task 1: Scaffold Next.js + Vitest
- [x] Task 2: Tokens design system + fuentes + tema + Button
- [x] Task 3: Prisma + schema + migración
- [ ] Task 4: Seed de 20 categorías
- [ ] Task 5: Backend de auth (Auth.js + registro)
- [ ] Task 6: Pantallas de entrada (login/registro/recuperar)
- [ ] Task 7: Shell de la app (sidebar/topbar/tema)
- [ ] Task 8: Rutas placeholder

## Bitácora
- Task 1: complete (commits 4c7dfa4..dac1d64, review clean)
- Task 2: complete (commits 65c872b..575d0e6, review found Critical radio bug → arreglado en 575d0e6 → verificado por el controlador)
- Task 3: complete (commits 995baf6..70c8b70, review clean; Prisma pineado a 6.19.3, migración aplicada a Neon)

## Decisiones de arquitectura (para fases futuras)
- shadcn actual (v4.13) usa **Base UI (`base-nova`)**, NO Radix. Los primitivos futuros
  (Dialog/DropdownMenu/Select/Popover) deben targetear la API de Base UI. Se acepta para el
  MVP (la Fase 0 no usa primitivos interactivos). Revisar al planear Fase 1/2.

## Hallazgos Minor (para la revisión final)
- Task 1: package.json sin campo `engines` (Node >=20). Autodocumentaría el constraint.
- Task 1: 2 vulnerabilidades moderadas del template de create-next-app, sin resolver.
- Task 1: Tailwind v4 (CSS-first, sin tailwind.config.js) — heads-up para tareas que asuman v3.
- Task 2: `components/ui/label.tsx` tiene `"use client"` innecesario (label estático, sin hooks).
- Task 2: `--radius: 0.9375rem` en globals.css quedó vestigial (nadie lo consume directo).
- Task 2: `app/layout.tsx` perdió el wrapper de altura completa (`h-full`) — reintroducir en Task 7 (shell).
- Task 3: falta script `"postinstall": "prisma generate"` — sin él, `npm install` en clon nuevo/CI no regenera el cliente.
- Task 3: el pin de Prisma 6.x solo está documentado en el reporte; un comentario en schema.prisma/package.json evitaría un upgrade accidental a 7.x.
