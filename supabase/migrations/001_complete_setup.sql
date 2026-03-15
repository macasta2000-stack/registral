-- ============================================================
-- REGISTRAL — Complete Database Setup
--
-- INSTRUCTIONS: Copy ALL of this and paste it in your Supabase
-- SQL Editor (Dashboard → SQL → New Query → Run)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- TENANT_SEQUENCES table (for correlative numbering)
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

-- ─────────────────────────────────────────────────────────────
-- CAJA tables (for Phase 2)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS caja_sessions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opened_by       UUID REFERENCES users(id),
  closed_by       UUID REFERENCES users(id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  opening_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_balance NUMERIC(12,2),
  expected_balance NUMERIC(12,2),
  difference      NUMERIC(12,2),
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE caja_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS caja_movements (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES caja_sessions(id),
  type            TEXT NOT NULL CHECK (type IN ('ingreso','egreso','ajuste')),
  category        TEXT NOT NULL DEFAULT 'otros',
  description     TEXT,
  amount          NUMERIC(12,2) NOT NULL,
  payment_method  TEXT DEFAULT 'efectivo',
  reference_type  TEXT,
  reference_id    UUID,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE caja_movements ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- DROP existing policies (safe: IF EXISTS)
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  _tbl TEXT;
  _pol RECORD;
BEGIN
  FOR _tbl IN SELECT unnest(ARRAY[
    'tenants','users','modules_access','products','entities',
    'transactions','transaction_items','stock_movements',
    'accounts_receivable','event_log','tenant_sequences',
    'caja_sessions','caja_movements'
  ]) LOOP
    FOR _pol IN
      SELECT policyname FROM pg_policies WHERE tablename = _tbl AND schemaname = 'public'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', _pol.policyname, _tbl);
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- RLS POLICIES — TENANTS
-- ─────────────────────────────────────────────────────────────

-- During registration the user has no row in users yet,
-- so we allow any authenticated user to INSERT a tenant.
CREATE POLICY "tenants_insert" ON tenants FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "tenants_select" ON tenants FOR SELECT
  TO authenticated USING (
    id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "tenants_update" ON tenants FOR UPDATE
  TO authenticated
  USING (id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
  WITH CHECK (id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "tenants_delete" ON tenants FOR DELETE
  TO authenticated USING (
    id IN (SELECT tenant_id FROM users u2 WHERE u2.id = auth.uid() AND u2.role = 'owner')
  );

-- ─────────────────────────────────────────────────────────────
-- RLS POLICIES — USERS
-- ─────────────────────────────────────────────────────────────

-- During registration the user creates their own row
CREATE POLICY "users_insert" ON users FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "users_select" ON users FOR SELECT
  TO authenticated USING (
    tenant_id IN (SELECT u2.tenant_id FROM users u2 WHERE u2.id = auth.uid())
    OR id = auth.uid()
  );

CREATE POLICY "users_update" ON users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ─────────────────────────────────────────────────────────────
-- RLS POLICIES — ALL OTHER TABLES (tenant isolation)
-- ─────────────────────────────────────────────────────────────

-- Generic tenant isolation macro for each table
DO $$
DECLARE
  _tbl TEXT;
BEGIN
  FOR _tbl IN SELECT unnest(ARRAY[
    'modules_access','products','entities','transactions',
    'transaction_items','stock_movements','accounts_receivable',
    'event_log','tenant_sequences','caja_sessions','caja_movements'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated
       USING (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))
       WITH CHECK (tenant_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()))',
      _tbl || '_tenant_isolation', _tbl
    );
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────
-- RPC: provision_tenant
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION provision_tenant(p_tenant_id UUID, p_rubro TEXT)
RETURNS VOID AS $$
BEGIN
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
-- RPC: next_sequence
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
-- CLEANUP: Delete the test user if it exists (so we can re-register)
-- ─────────────────────────────────────────────────────────────

-- Delete any orphaned data from failed registrations
DELETE FROM users WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'test@registral.app'
);
DELETE FROM tenants WHERE id NOT IN (
  SELECT DISTINCT tenant_id FROM users WHERE tenant_id IS NOT NULL
);

-- Delete the auth user so we can re-register
DELETE FROM auth.users WHERE email = 'test@registral.app';

-- ============================================================
-- DONE! Now go back to http://localhost:5173/register
-- and register with test@registral.app / Test1234!
-- ============================================================
