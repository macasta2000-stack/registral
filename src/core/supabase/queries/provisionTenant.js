/**
 * REGISTRAL — Tenant Provisioning
 * src/core/supabase/queries/provisionTenant.js
 *
 * Funciones:
 *   createTenantAndUser(userId, email, fullName)
 *     → Crea el tenant (rubro: null) + el user (owner)
 *     → Se llama inmediatamente después de auth.signUp
 *
 *   provisionRubro(tenantId, rubro, presetModules)
 *     → UPDATE tenant.rubro
 *     → Llama a la RPC provision_tenant() del schema
 *     → Inserta módulos en modules_access
 *     → Retorna el tenant actualizado
 *
 * Nota: provision_tenant() en el schema crea las sequences.
 * Los modules_access se insertan aquí en JS para mantener flexibilidad.
 */

import { supabase } from '../client'

// ─────────────────────────────────────────────────────────────
// PASO 1: Crear tenant + user (rubro todavía null)
// Llamar justo después de auth.signUp exitoso
// ─────────────────────────────────────────────────────────────

export async function createTenantAndUser({ userId, email, fullName = '' }) {
  // Usa la función SECURITY DEFINER que bypasea RLS
  // (un user recién registrado no tiene tenant aún, RLS bloquearía INSERTs directos)
  const { data, error } = await supabase.rpc('register_tenant_and_user', {
    p_user_id:   userId,
    p_email:     email,
    p_full_name: fullName || '',
  })

  if (error) {
    throw new Error(`Error creando tenant: ${error.message}`)
  }

  return data
}

// ─────────────────────────────────────────────────────────────
// PASO 2: Provisionar el rubro elegido
// Llamar cuando el usuario confirma su rubro en el onboarding
// ─────────────────────────────────────────────────────────────

export async function provisionRubro({ tenantId, rubro, presetModules = [] }) {
  // 2a. Actualizar el rubro en el tenant
  const { data: updatedTenant, error: rubroError } = await supabase
    .from('tenants')
    .update({ rubro })
    .eq('id', tenantId)
    .select()
    .single()

  if (rubroError) {
    throw new Error(`Error asignando rubro: ${rubroError.message}`)
  }

  // 2b. Llamar al RPC provision_tenant() del schema SQL
  // Crea las secuencias correlativas (REM-0001, CLI-0001, etc.)
  const { error: rpcError } = await supabase.rpc('provision_tenant', {
    p_tenant_id: tenantId,
    p_rubro:     rubro,
  })

  if (rpcError) {
    console.warn('[provisionTenant] RPC provision_tenant falló:', rpcError.message)
    // No es fatal — las sequences se pueden crear manualmente después
  }

  // 2c. Insertar modules_access basado en los módulos del preset
  // presetModules viene del preset.[rubro].json modules_enabled
  if (presetModules.length > 0) {
    const modulesRows = presetModules.map((moduleId) => ({
      tenant_id:     tenantId,
      module_id:     moduleId,
      is_enabled:    true,
      plan_required: 'basico',
      enabled_at:    new Date().toISOString(),
    }))

    const { error: modulesError } = await supabase
      .from('modules_access')
      .upsert(modulesRows, { onConflict: 'tenant_id,module_id' })

    if (modulesError) {
      console.warn('[provisionTenant] Error insertando modules_access:', modulesError.message)
    }
  }

  return updatedTenant
}

// ─────────────────────────────────────────────────────────────
// UTILITARIO: Marcar onboarding como completado
// ─────────────────────────────────────────────────────────────

export async function completeOnboarding(tenantId, currentSettings) {
  const { data, error } = await supabase
    .from('tenants')
    .update({
      settings: {
        ...currentSettings,
        onboarding_completed: true,
        onboarding_step:      4,
      },
    })
    .eq('id', tenantId)
    .select()
    .single()

  if (error) throw new Error(`Error completando onboarding: ${error.message}`)
  return data
}

// ─────────────────────────────────────────────────────────────
// UTILITARIO: Guardar paso de onboarding (para retomar si abandona)
// ─────────────────────────────────────────────────────────────

export async function saveOnboardingStep(tenantId, step, currentSettings) {
  const { error } = await supabase
    .from('tenants')
    .update({
      settings: { ...currentSettings, onboarding_step: step },
    })
    .eq('id', tenantId)

  if (error) {
    console.warn('[provisionTenant] No se pudo guardar onboarding_step:', error.message)
  }
}

// ─────────────────────────────────────────────────────────────
// UTILITARIO: Actualizar settings del negocio (BusinessSetupForm)
// ─────────────────────────────────────────────────────────────

export async function updateBusinessSettings(tenantId, partialSettings) {
  const { data: current } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single()

  const merged = { ...(current?.settings ?? {}), ...partialSettings }

  const { data, error } = await supabase
    .from('tenants')
    .update({ settings: merged, name: partialSettings.business_name || current?.settings?.business_name || '' })
    .eq('id', tenantId)
    .select()
    .single()

  if (error) throw new Error(`Error guardando configuración: ${error.message}`)
  return data
}
