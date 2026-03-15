/**
 * REGISTRAL — Migration 002: Security Hardening
 * Applied: 2026-03-15
 *
 * Fixes critical RLS vulnerabilities found during security audit:
 *
 * 1. All 20 tenant-isolation policies changed from TO public → TO authenticated
 *    (prevents anon/unauthenticated access to business data)
 *
 * 2. users_insert: WITH CHECK (id = auth.uid())
 *    (prevents privilege escalation — users can only create their own row)
 *
 * 3. users_update: USING/WITH CHECK (id = auth.uid())
 *    (users can only update their own row, not other tenant members)
 *
 * 4. tenants_insert: WITH CHECK (NOT EXISTS user row)
 *    (prevents creating unlimited tenants)
 *
 * 5. REVOKE EXECUTE from anon on all SECURITY DEFINER functions
 *    (these functions bypass RLS — anon must never call them)
 *
 * 6. REVOKE ALL table privileges from anon on all business tables
 */

-- ============================================================
-- 1. Change all policies from TO public → TO authenticated
-- ============================================================

ALTER POLICY accounts_receivable_tenant_isolation ON accounts_receivable TO authenticated;
ALTER POLICY caja_movements_tenant_isolation ON caja_movements TO authenticated;
ALTER POLICY caja_sessions_tenant_isolation ON caja_sessions TO authenticated;
ALTER POLICY custom_fields_tenant_isolation ON custom_fields TO authenticated;
ALTER POLICY entities_tenant_isolation ON entities TO authenticated;
ALTER POLICY event_log_insert ON event_log TO authenticated;
ALTER POLICY event_log_no_delete ON event_log TO authenticated;
ALTER POLICY event_log_no_update ON event_log TO authenticated;
ALTER POLICY event_log_select ON event_log TO authenticated;
ALTER POLICY allow_tenant_insert_modules ON modules_access TO authenticated;
ALTER POLICY allow_tenant_read_modules ON modules_access TO authenticated;
ALTER POLICY modules_access_tenant_isolation ON modules_access TO authenticated;
ALTER POLICY notifications_tenant_isolation ON notifications TO authenticated;
ALTER POLICY products_tenant_isolation ON products TO authenticated;
ALTER POLICY schedules_tenant_isolation ON schedules TO authenticated;
ALTER POLICY stock_movements_tenant_isolation ON stock_movements TO authenticated;
ALTER POLICY sync_queue_tenant_isolation ON sync_queue TO authenticated;
ALTER POLICY tenant_sequences_isolation ON tenant_sequences TO authenticated;
ALTER POLICY transaction_items_tenant_isolation ON transaction_items TO authenticated;
ALTER POLICY transactions_tenant_isolation ON transactions TO authenticated;

-- ============================================================
-- 2. Fix privilege escalation on users table
-- ============================================================

-- users_insert: Only allow users to insert their OWN row
ALTER POLICY users_insert ON users
  WITH CHECK (id = auth.uid());

-- users_update: Only allow users to update their OWN row
ALTER POLICY users_update ON users
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ============================================================
-- 3. Fix tenants_insert to prevent unlimited tenant creation
-- ============================================================

ALTER POLICY tenants_insert ON tenants
  WITH CHECK (
    NOT EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid())
  );

-- ============================================================
-- 4. Revoke EXECUTE on SECURITY DEFINER functions from anon
-- ============================================================

REVOKE EXECUTE ON FUNCTION register_tenant_and_user(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION provision_tenant(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION apply_stock_movement() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION sync_entity_balance() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION next_sequence(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_tenant_id() FROM anon;
REVOKE EXECUTE ON FUNCTION get_user_role() FROM anon;

-- Re-grant explicitly to authenticated and service_role
GRANT EXECUTE ON FUNCTION register_tenant_and_user(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION provision_tenant(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION apply_stock_movement() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sync_entity_balance() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION next_sequence(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated, service_role;

-- ============================================================
-- 5. Revoke ALL table privileges from anon
-- ============================================================

REVOKE ALL ON TABLE tenants FROM anon;
REVOKE ALL ON TABLE users FROM anon;
REVOKE ALL ON TABLE entities FROM anon;
REVOKE ALL ON TABLE products FROM anon;
REVOKE ALL ON TABLE transactions FROM anon;
REVOKE ALL ON TABLE transaction_items FROM anon;
REVOKE ALL ON TABLE stock_movements FROM anon;
REVOKE ALL ON TABLE accounts_receivable FROM anon;
REVOKE ALL ON TABLE caja_sessions FROM anon;
REVOKE ALL ON TABLE caja_movements FROM anon;
REVOKE ALL ON TABLE schedules FROM anon;
REVOKE ALL ON TABLE notifications FROM anon;
REVOKE ALL ON TABLE modules_access FROM anon;
REVOKE ALL ON TABLE custom_fields FROM anon;
REVOKE ALL ON TABLE event_log FROM anon;
REVOKE ALL ON TABLE sync_queue FROM anon;
REVOKE ALL ON TABLE tenant_sequences FROM anon;
