# Progreso — Growly Fase 0 (Fundaciones)

Plan: docs/superpowers/plans/2026-07-05-growly-fase-0-fundaciones.md
Rama: feature/fase-0-fundaciones

## Tareas
- [x] Task 1: Scaffold Next.js + Vitest
- [ ] Task 2: Tokens design system + fuentes + tema + Button
- [ ] Task 3: Prisma + schema + migración
- [ ] Task 4: Seed de 20 categorías
- [ ] Task 5: Backend de auth (Auth.js + registro)
- [ ] Task 6: Pantallas de entrada (login/registro/recuperar)
- [ ] Task 7: Shell de la app (sidebar/topbar/tema)
- [ ] Task 8: Rutas placeholder

## Bitácora
- Task 1: complete (commits 4c7dfa4..dac1d64, review clean)

## Hallazgos Minor (para la revisión final)
- Task 1: package.json sin campo `engines` (Node >=20). Autodocumentaría el constraint.
- Task 1: 2 vulnerabilidades moderadas del template de create-next-app, sin resolver.
- Task 1: Tailwind v4 (CSS-first, sin tailwind.config.js) — heads-up para tareas que asuman v3.
