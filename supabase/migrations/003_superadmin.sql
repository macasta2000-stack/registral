-- =====================================================
-- REGISTRAL — Migration 003: Superadmin System
-- =====================================================
-- Adds superadmin capability for master user to monitor
-- and access any tenant account.
--
-- INSTRUCTIONS: Run this SQL in Supabase Studio → SQL Editor
-- =====================================================

-- 1. Add is_superadmin column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE;

-- 2. Set macasta2000@gmail.com as superadmin
UPDATE users
SET is_superadmin = TRUE
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'macasta2000@gmail.com'
);

-- 3. Helper function: check if current user is superadmin
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_superadmin FROM users WHERE id = auth.uid()),
    FALSE
  );
$$;

-- 4. Admin function: list ALL tenants (only for superadmin)
CREATE OR REPLACE FUNCTION admin_list_tenants()
RETURNS TABLE (
  id UUID,
  name TEXT,
  rubro TEXT,
  plan TEXT,
  billing_status TEXT,
  settings JSONB,
  created_at TIMESTAMPTZ,
  user_count BIGINT,
  owner_email TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only superadmins can call this
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Access denied: superadmin required';
  END IF;

  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.rubro,
    t.plan,
    t.billing_status,
    t.settings,
    t.created_at,
    (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count,
    (SELECT au.email FROM users u2
     JOIN auth.users au ON au.id = u2.id
     WHERE u2.tenant_id = t.id AND u2.role = 'owner'
     LIMIT 1) AS owner_email
  FROM tenants t
  ORDER BY t.created_at DESC;
END;
$$;

-- 5. Admin function: get full tenant data for impersonation
CREATE OR REPLACE FUNCTION admin_get_tenant(p_tenant_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Access denied: superadmin required';
  END IF;

  SELECT json_build_object(
    'tenant', row_to_json(t),
    'users', (
      SELECT json_agg(json_build_object(
        'id', u.id,
        'role', u.role,
        'full_name', u.full_name,
        'is_active', u.is_active,
        'email', au.email
      ))
      FROM users u
      JOIN auth.users au ON au.id = u.id
      WHERE u.tenant_id = t.id
    ),
    'stats', json_build_object(
      'products', (SELECT COUNT(*) FROM products p WHERE p.tenant_id = t.id),
      'entities', (SELECT COUNT(*) FROM entities e WHERE e.tenant_id = t.id),
      'transactions', (SELECT COUNT(*) FROM transactions tx WHERE tx.tenant_id = t.id)
    )
  ) INTO result
  FROM tenants t
  WHERE t.id = p_tenant_id;

  RETURN result;
END;
$$;

-- 6. Admin function: get tenant stats summary
CREATE OR REPLACE FUNCTION admin_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_superadmin() THEN
    RAISE EXCEPTION 'Access denied: superadmin required';
  END IF;

  RETURN json_build_object(
    'total_tenants', (SELECT COUNT(*) FROM tenants),
    'total_users', (SELECT COUNT(*) FROM users),
    'tenants_by_rubro', (
      SELECT json_object_agg(COALESCE(rubro, 'sin_rubro'), cnt)
      FROM (SELECT rubro, COUNT(*) AS cnt FROM tenants GROUP BY rubro) sub
    ),
    'tenants_by_plan', (
      SELECT json_object_agg(COALESCE(plan, 'sin_plan'), cnt)
      FROM (SELECT plan, COUNT(*) AS cnt FROM tenants GROUP BY plan) sub
    ),
    'recent_signups', (
      SELECT json_agg(row_to_json(sub))
      FROM (
        SELECT t.id, t.name, t.rubro, t.created_at,
               (SELECT au.email FROM users u JOIN auth.users au ON au.id = u.id
                WHERE u.tenant_id = t.id AND u.role = 'owner' LIMIT 1) AS owner_email
        FROM tenants t
        ORDER BY t.created_at DESC
        LIMIT 10
      ) sub
    )
  );
END;
$$;

-- 7. Security: restrict admin functions
REVOKE EXECUTE ON FUNCTION is_superadmin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_list_tenants() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_get_tenant(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_dashboard_stats() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_tenant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION is_superadmin() TO service_role;
GRANT EXECUTE ON FUNCTION admin_list_tenants() TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_tenant(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION admin_dashboard_stats() TO service_role;
