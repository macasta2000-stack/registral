# REGISTRAL - Vertical SaaS Multi-Rubro

## Que es
Software de gestion empresarial (tipo FUDO pero multi-industria). Cada rubro (correlon, gastronomia, medicina, abogacia, retail, servicios_generales) tiene su propio preset con modulos, vocabulario, campos y flujos.

## Stack
- **Frontend**: React 19 + Vite 5 + Tailwind CSS v4
- **Backend**: Supabase (Auth + PostgreSQL + Realtime + RLS)
- **Offline**: IndexedDB via Dexie v4 + syncEngine custom
- **PWA**: vite-plugin-pwa + Workbox (precache 40 entries)
- **Deploy**: GitHub Pages + GitHub Actions auto-deploy
- **Charts**: Recharts (lazy loaded)
- **State**: TanStack Query + useReducer (AuthContext)

## URLs
- **App live**: https://macasta2000-stack.github.io/registral/
- **Repo**: https://github.com/macasta2000-stack/registral (public)
- **Supabase project**: bxcgyzdloxmjnqqtuqfa
- **Supabase URL**: https://bxcgyzdloxmjnqqtuqfa.supabase.co

## Estructura
```
src/
  app/          # Router, providers, entry point
  core/
    auth/       # AuthContext, AuthGuard, OnboardingGuard, useAuth
    engine/     # PresetContext (motor de modulos condicionales)
    offline/    # Dexie DB, syncEngine, connectivity
    supabase/   # Client, queries (provisionTenant, etc)
  modules/      # Paginas por modulo: dashboard, stock, remitos, clientes,
                # cuenta-corriente, agenda-entregas, caja, reportes
  onboarding/   # OnboardingPage, RubroSelector, BusinessSetupForm,
                # DemoPreview, GuidedTour
  presets/      # JSON por rubro: preset.correlon.json, preset.gastronomia.json, etc
  shared/
    layout/     # AppShell (sidebar + topbar + outlet)
    ui/         # ErrorBoundary, helpers (formatARS, etc)
supabase/
  migrations/   # SQL migrations (001_complete_setup, 001_rls_policies, 002_security_hardening)
```

## Arquitectura clave

### Multi-tenant con RLS
- Cada tabla tiene `tenant_id` + RLS policy `tenant_id = get_tenant_id()`
- `get_tenant_id()` es SECURITY DEFINER: busca tenant_id del usuario autenticado
- Todas las policies son `TO authenticated` (anon no tiene acceso)
- Funciones SECURITY DEFINER: register_tenant_and_user, provision_tenant, apply_stock_movement, sync_entity_balance, next_sequence, get_tenant_id, get_user_role

### Presets por rubro
- Archivos JSON en /src/presets/ (bundleados con Vite)
- PresetContext carga el preset segun tenant.rubro
- Cada preset define: modules_enabled, modules_locked, vocabulary, fields, dashboard_metrics, alert_rules, transaction_flow, plan_limits
- El tenant puede customizar vocabulary y fields via preset_config (JSONB en Supabase)

### Offline-first
- Dexie v4 como IndexedDB wrapper
- syncEngine con cola de operaciones pendientes
- Workbox service worker para precache de assets
- NetworkFirst para Supabase API calls (cacheado)

### Flujo de auth
1. supabase.auth.signUp/signIn
2. register_tenant_and_user RPC (SECURITY DEFINER, idempotente)
3. AuthContext hydrate: getSession -> fetchUserAndTenant
4. PresetContext consume tenant de AuthContext (NO re-fetcha)
5. OnboardingGuard redirige si !onboarding_completed

### Guards (en orden)
AuthGuard -> OnboardingGuard -> ModuleGuard -> Pagina

## Usuarios de test en Supabase
- macasta2000@gmail.com (owner)
- maurocastagnaro196@gmail.com (rubro: null, necesita onboarding)
- test@registral.app
- macasta2000@hotmail.com

## GitHub Pages
- `vite.config.ts` tiene `base: '/registral/'`
- `providers.jsx` tiene `<BrowserRouter basename={import.meta.env.BASE_URL}>`
- `public/404.html` redirige SPAs al index
- Deploy automatico via `.github/workflows/deploy.yml`
- Las env vars de Supabase estan hardcodeadas en el workflow (anon key, es publica)

## Lo que falta (backlog)
- Rutas para otros rubros (solo correlon tiene pages completas)
- Pasarela de pagos (Stripe/MercadoPago) para monetizacion
- Dominio .com propio (requiere compra)
- Panel de admin/agencia para gestionar multiples tenants
- Notificaciones push reales
- Tests (unit + integration)

## Reglas para Claude
- NO gastar dinero. Buscar siempre la opcion gratuita.
- Trabajar de forma 100% autonoma. No pedir confirmacion.
- El usuario habla en espanol argentino.
- Ante errores de Supabase RLS, revisar que las policies usen `TO authenticated` y que las funciones SECURITY DEFINER tengan REVOKE de anon.
- Ante hooks violations: TODOS los useState/useEffect/useCallback ANTES de cualquier return condicional.
- Para deploy: git push a main triggerea auto-deploy a GitHub Pages (~45s).
