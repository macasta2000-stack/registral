-- ============================================================
-- REGISTRAL — RLS Policies & RPC Functions
-- Run this in Supabase SQL Editor (Dashboard → SQL → New Query)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. TENANTS — RLS Policies
-- ─────────────────────────────────────────────────────────────

-- Allow authenticated users to INSERT a new tenant (during registration)
CREATE POLICY IF NOT EXISTS "Users can create tenants"
  ON tenants FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow users to SELECT their own tenant (via users table join)
CREATE POLICY IF NOT EXISTS "Users can read own tenant"
  ON tenants FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Allow users to UPDATE their own tenant
CREATE POLICY IF NOT EXISTS "Users can update own tenant"
  ON tenants FOR UPDATE
  TO authenticated
  USING (
    id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 2. USERS — RLS Policies
-- ─────────────────────────────────────────────────────────────

-- Allow authenticated users to INSERT their own user row (during registration)
CREATE POLICY IF NOT EXISTS "Users can create own user row"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Allow users to SELECT users in their tenant
CREATE POLICY IF NOT EXISTS "Users can read tenant users"
  ON users FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- Allow users to UPDATE their own row
CREATE POLICY IF NOT EXISTS "Users can update own row"
  ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- 3. MODULES_ACCESS — RLS Policies
-- ─────────────────────────────────────────────────────────────

-- Allow users to manage modules for their tenant
CREATE POLICY IF NOT EXISTS "Users can manage tenant modules"
  ON modules_access FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 4. PRODUCTS — RLS Policies
-- ─────────────────────────────────────────────────────────────

CREATE POLICY IF NOT EXISTS "Tenant isolation for products"
  ON products FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 5. ENTITIES — RLS Policies
-- ─────────────────────────────────────────────────────────────

CREATE POLICY IF NOT EXISTS "Tenant isolation for entities"
  ON entities FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 6. TRANSACTIONS — RLS Policies
-- ─────────────────────────────────────────────────────────────

CREATE POLICY IF NOT EXISTS "Tenant isolation for transactions"
  ON transactions FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 7. TRANSACTION_ITEMS — RLS Policies
-- ─────────────────────────────────────────────────────────────

CREATE POLICY IF NOT EXISTS "Tenant isolation for transaction_items"
  ON transaction_items FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 8. STOCK_MOVEMENTS — RLS Policies
-- ─────────────────────────────────────────────────────────────

CREATE POLICY IF NOT EXISTS "Tenant isolation for stock_movements"
  ON stock_movements FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 9. ACCOUNTS_RECEIVABLE — RLS Policies
-- ─────────────────────────────────────────────────────────────

CREATE POLICY IF NOT EXISTS "Tenant isolation for accounts_receivable"
  ON accounts_receivable FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 10. EVENT_LOG — RLS Policies
-- ─────────────────────────────────────────────────────────────

CREATE POLICY IF NOT EXISTS "Tenant isolation for event_log"
  ON event_log FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

-- ─────────────────────────────────────────────────────────────
-- 11. RPC: provision_tenant
-- Creates correlative sequences for a tenant+rubro
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION provision_tenant(p_tenant_id UUID, p_rubro TEXT)
RETURNS VOID AS $$
BEGIN
  -- Create a sequences table entry if not exists
  INSERT INTO tenant_sequences (tenant_id, sequence_key, current_value)
  VALUES
    (p_tenant_id, 'remito',      0),
    (p_tenant_id, 'cliente',     0),
    (p_tenant_id, 'producto',    0),
    (p_tenant_id, 'factura',     0),
    (p_tenant_id, 'presupuesto', 0),
    (p_tenant_id, 'expediente',  0),
    (p_tenant_id, 'turno',       0)
  ON CONFLICT (tenant_id, sequence_key) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- 12. RPC: next_sequence
-- Returns the next correlative number for a given tenant+key
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION next_sequence(p_tenant_id UUID, p_key TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_next INTEGER;
BEGIN
  UPDATE tenant_sequences
    SET current_value = current_value + 1
    WHERE tenant_id = p_tenant_id AND sequence_key = p_key
    RETURNING current_value INTO v_next;

  IF v_next IS NULL THEN
    INSERT INTO tenant_sequences (tenant_id, sequence_key, current_value)
    VALUES (p_tenant_id, p_key, 1)
    RETURNING current_value INTO v_next;
  END IF;

  RETURN v_next;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────
-- 13. TENANT_SEQUENCES table (for RPC functions above)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenant_sequences (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_key  TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, sequence_key)
);

ALTER TABLE tenant_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Tenant isolation for sequences"
  ON tenant_sequences FOR ALL
  TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );
