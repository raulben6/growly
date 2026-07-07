# Progreso — Growly Fase 0 (Fundaciones)

Plan: docs/superpowers/plans/2026-07-05-growly-fase-0-fundaciones.md
Rama: feature/fase-0-fundaciones

## Tareas
- [x] Task 1: Scaffold Next.js + Vitest
- [x] Task 2: Tokens design system + fuentes + tema + Button
- [x] Task 3: Prisma + schema + migración
- [x] Task 4: Seed de 20 categorías
- [x] Task 5: Backend de auth (Auth.js + registro)
- [x] Task 6: Pantallas de entrada (login/registro/recuperar)
- [x] Task 7: Shell de la app (sidebar/topbar/tema)
- [x] Task 8: Rutas placeholder

## Bitácora
- Task 1: complete (commits 4c7dfa4..dac1d64, review clean)
- Task 2: complete (commits 65c872b..575d0e6, review found Critical radio bug → arreglado en 575d0e6 → verificado por el controlador)
- Task 3: complete (commits 995baf6..70c8b70, review clean; Prisma pineado a 6.19.3, migración aplicada a Neon)
- Task 4: complete (commits 6e7fc85..94693b0, review clean; 20 categorías sembradas, idempotente)
- Task 5: complete (commits b68859e..5d187c7, review Approved; auth Credentials+bcrypt+JWT, Google condicional)
- Task 6: complete (commits 80cfe0a..16fc4bf, review Approved; pantallas de entrada + e2e real registro→dashboard)
- Task 7: complete (commits 5f94241..0f1b4f7, review Approved; shell sidebar/topbar/tema, layout (app) con guard auth())
- Task 8: complete (commits c79ecf8..befaae0, review Approved; rutas placeholder, app/page.tsx scaffold eliminado)
- === FASE 0 COMPLETA: 8/8 tareas ===
- Revisión final de rama (Opus): "Ready to merge — with fixes", sin Critical. 3 arreglos pre-merge
  aplicados en `339b037` (postinstall prisma generate; `session.user.id` vía callbacks JWT+augmentación
  de tipos, verificado por e2e contra `/api/auth/session`; botón Google oculto tras `NEXT_PUBLIC_GOOGLE_ENABLED`).
- Estado: unit 11/11, build limpio, e2e pasa. LISTA PARA MERGE.

## Backlog Fase 1 (del triaje de la revisión final)
- **PRIMERO en Fase 1:** separar `lib/auth.ts` en `auth.config.ts` edge-safe (para middleware, sin
  adapter/prisma/bcrypt) + `auth.ts` Node (con adapter). Adelgaza el bundle edge y prepara el fix de AuthAccount.
- **Antes de habilitar Google:** remapear `AuthAccount` vs `@auth/prisma-adapter` (renombrar el modelo
  financiero `Account` o envolver el adapter), luego poner `NEXT_PUBLIC_GOOGLE_ENABLED=true`.
- **Fixes Fase 1:** icono `paw`→`paw-print` + fallback de icono; `register` verificar resultado de `signIn`;
  hardening auth (enumeración por timing, `create` no atómico→try/catch P2002); `sidebar` active-state exacto.
- **Aceptados/won't-fix Fase 0:** deprecación `middleware`→`proxy` (warning), campo `engines`, `label.tsx`
  `use client`, tokens vestigiales (`--radius`, `--shadow-elev/glow`, `--field`/`--track`), `Card`/`tw-animate-css`
  sin usar, vulns moderadas del template (monitorear con `npm audit`).

## Decisiones de arquitectura (para fases futuras)
- shadcn actual (v4.13) usa **Base UI (`base-nova`)**, NO Radix. Los primitivos futuros
  (Dialog/DropdownMenu/Select/Popover) deben targetear la API de Base UI. Se acepta para el
  MVP (la Fase 0 no usa primitivos interactivos). Revisar al planear Fase 1/2.
- **MUST-FIX antes de activar Google OAuth:** `@auth/prisma-adapter` espera un modelo `Account`,
  pero aquí `Account` es el financiero (el de Auth.js es `AuthAccount`). Inerte hoy (Credentials+JWT
  no llaman al adapter), pero rompe en cuanto se habilite cualquier OAuth. Opciones: renombrar el
  modelo financiero, o envolver el adapter para enrutar `account`→`authAccount`. Verificado inerte
  por la revisión de Task 5.
- Next 16 avisa deprecación `middleware`→`proxy` (solo warning). Mantener `middleware.ts` en Fase 0.

## Hallazgos Minor (para la revisión final)
- Task 1: package.json sin campo `engines` (Node >=20). Autodocumentaría el constraint.
- Task 1: 2 vulnerabilidades moderadas del template de create-next-app, sin resolver.
- Task 1: Tailwind v4 (CSS-first, sin tailwind.config.js) — heads-up para tareas que asuman v3.
- Task 2: `components/ui/label.tsx` tiene `"use client"` innecesario (label estático, sin hooks).
- Task 2: `--radius: 0.9375rem` en globals.css quedó vestigial (nadie lo consume directo).
- Task 2: `app/layout.tsx` perdió el wrapper de altura completa (`h-full`) — reintroducir en Task 7 (shell).
- Task 3: falta script `"postinstall": "prisma generate"` — sin él, `npm install` en clon nuevo/CI no regenera el cliente.
- Task 3: el pin de Prisma 6.x solo está documentado en el reporte; un comentario en schema.prisma/package.json evitaría un upgrade accidental a 7.x.
- Task 4: `icon: 'paw'` (Mascotas) probablemente no existe en lucide-react (usar `paw-print`). Corregir al construir la UI de categorías en Fase 1 y añadir fallback de icono para nombres desconocidos. Nota: la fila ya sembrada no se actualiza al re-correr el seed (idempotencia por `name`); habrá que actualizarla o re-seedear.
- Task 5 (hardening auth, Minor — decidir en revisión final): (a) enumeración por timing en `authorize` (correr un `bcrypt.compare` dummy cuando el usuario no existe); (b) registro: `findUnique`+`create` no atómico → envolver `create` en try/catch y mapear P2002 a `{ ok:false }`; (c) `middleware.ts` usa `startsWith` para páginas de auth (podría matchear `/loginX`); (d) `requestPasswordReset` no valida el email con Zod.
- Task 6 (Minor): (a) `register/page.tsx` no verifica el resultado de `signIn` antes de `router.push('/')` → si falla el signin post-registro, rebota a /login sin explicación; (b) botón "Enviar enlace" de forgot-password sin estado loading/disabled (doble clic).
- Task 7 (Minor): (a) `sidebar.tsx` icono activo con `text-primary` dentro de un Link `text-white` → estilo ambiguo/muerto; (b) `startsWith(href)` marcaría activo un futuro `/cuentas-viejas` (footgun si se añaden rutas hermanas).
- Task 8 (Minor): (a) primer build falló por caché stale de `.next` referenciando el `app/page.tsx` borrado (resuelto con `rm -rf .next`) — nota para invalidación de caché en CI; (b) `coming-soon.test.tsx` solo prueba un título ("Metas") — un `test.each` sobre los 5 títulos reales apretaría cobertura (opcional).
