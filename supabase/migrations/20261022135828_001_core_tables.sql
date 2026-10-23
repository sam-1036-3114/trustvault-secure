/*
# TrustVault Core Tables — Part 1

## Overview
Creates foundational tables: profiles, organisation_settings, document_permissions,
audit_events, audit_chain_heads, security_alerts, plus SECURITY DEFINER functions
for tamper-evident audit logging with SHA-256 hash chains.

## New Tables
1. profiles — extends auth.users with role (admin/owner/viewer), display name, account status
2. organisation_settings — single-row org config (max file size, allowed types)
3. document_permissions — per-document, per-user grants (read or edit)
4. audit_events — append-only, hash-chained audit log
5. audit_chain_heads — tracks latest hash per chain for integrity verification
6. security_alerts — flagged suspicious activity patterns

## Security
- RLS enabled on ALL tables
- Roles in profiles table (server-controlled), NOT user-mutable metadata
- Audit events append-only: authenticated role has SELECT only; inserts via SECURITY DEFINER function
- Hash chain uses SHA-256 via pgcrypto digest() in extensions schema
- Functions SET search_path to 'public, extensions' so digest() resolves
*/

-- ============================================================================
-- PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'owner', 'viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON profiles TO authenticated;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "select_all_profiles_limited" ON profiles;
CREATE POLICY "select_all_profiles_limited" ON profiles FOR SELECT
  TO authenticated USING (status = 'active');

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- ORGANISATION_SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS organisation_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  org_name text NOT NULL DEFAULT 'TrustVault',
  max_file_size_bytes bigint NOT NULL DEFAULT 10485760,
  allowed_file_types text[] NOT NULL DEFAULT ARRAY['pdf','docx','xlsx','pptx','txt','png','jpg','jpeg'],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organisation_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON organisation_settings TO authenticated;

DROP POLICY IF EXISTS "select_org_settings" ON organisation_settings;
CREATE POLICY "select_org_settings" ON organisation_settings FOR SELECT
  TO authenticated USING (true);

-- ============================================================================
-- DOCUMENT_PERMISSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_level text NOT NULL CHECK (access_level IN ('read', 'edit')),
  granted boolean NOT NULL DEFAULT true,
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, user_id)
);

ALTER TABLE document_permissions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON document_permissions TO authenticated;

-- ============================================================================
-- AUDIT_EVENTS TABLE (append-only, hash-chained)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_number bigint NOT NULL,
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  document_id uuid,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'denied', 'error')),
  request_id text DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text NOT NULL DEFAULT 'GENESIS',
  current_hash text NOT NULL,
  chain_id text NOT NULL DEFAULT 'main'
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON audit_events TO authenticated;

-- ============================================================================
-- AUDIT_CHAIN_HEADS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_chain_heads (
  chain_id text PRIMARY KEY DEFAULT 'main',
  last_sequence bigint NOT NULL DEFAULT 0,
  last_hash text NOT NULL DEFAULT 'GENESIS',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_chain_heads ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON audit_chain_heads TO authenticated;

DROP POLICY IF EXISTS "select_chain_heads" ON audit_chain_heads;
CREATE POLICY "select_chain_heads" ON audit_chain_heads FOR SELECT
  TO authenticated USING (true);

-- ============================================================================
-- SECURITY_ALERTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  document_id uuid,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged boolean NOT NULL DEFAULT false,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE security_alerts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON security_alerts TO authenticated;

DROP POLICY IF EXISTS "select_relevant_alerts" ON security_alerts;
CREATE POLICY "select_relevant_alerts" ON security_alerts FOR SELECT
  TO authenticated USING (
    actor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "insert_alerts" ON security_alerts;
CREATE POLICY "insert_alerts" ON security_alerts FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_alerts_admin" ON security_alerts;
CREATE POLICY "update_alerts_admin" ON security_alerts FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- ============================================================================
-- TRIGGER: auto-create profile on user signup
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'viewer',
    'active'
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION handle_new_user FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION handle_new_user TO authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- TRIGGER: update updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS document_permissions_updated_at ON document_permissions;
CREATE TRIGGER document_permissions_updated_at BEFORE UPDATE ON document_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- SECURITY DEFINER: insert_audit_event
-- Hash-chained append-only audit event insertion.
-- search_path includes extensions so digest() resolves.
-- ============================================================================
CREATE OR REPLACE FUNCTION insert_audit_event(
  p_actor_id uuid DEFAULT NULL,
  p_action text DEFAULT '',
  p_document_id uuid DEFAULT NULL,
  p_target_user_id uuid DEFAULT NULL,
  p_outcome text DEFAULT 'success',
  p_request_id text DEFAULT '',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_chain_id text DEFAULT 'main'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
  v_sequence bigint;
  v_previous_hash text;
  v_current_hash text;
  v_canonical text;
BEGIN
  SELECT last_sequence, last_hash INTO v_sequence, v_previous_hash
  FROM audit_chain_heads
  WHERE chain_id = p_chain_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO audit_chain_heads (chain_id, last_sequence, last_hash)
    VALUES (p_chain_id, 0, 'GENESIS')
    ON CONFLICT (chain_id) DO NOTHING;

    SELECT last_sequence, last_hash INTO v_sequence, v_previous_hash
    FROM audit_chain_heads
    WHERE chain_id = p_chain_id
    FOR UPDATE;
  END IF;

  v_sequence := v_sequence + 1;

  v_canonical := p_chain_id || '|' || v_sequence::text || '|' ||
    COALESCE(p_actor_id::text, 'NULL') || '|' ||
    p_action || '|' ||
    COALESCE(p_document_id::text, 'NULL') || '|' ||
    COALESCE(p_target_user_id::text, 'NULL') || '|' ||
    p_outcome || '|' ||
    COALESCE(p_request_id, '') || '|' ||
    COALESCE(p_metadata::text, '{}') || '|' ||
    v_previous_hash;

  v_current_hash := encode(digest(v_canonical, 'sha256'), 'hex');

  INSERT INTO audit_events (
    sequence_number, actor_id, action, document_id, target_user_id,
    outcome, request_id, metadata, previous_hash, current_hash, chain_id
  ) VALUES (
    v_sequence, p_actor_id, p_action, p_document_id, p_target_user_id,
    p_outcome, p_request_id, p_metadata, v_previous_hash, v_current_hash, p_chain_id
  )
  RETURNING id INTO v_id;

  UPDATE audit_chain_heads
  SET last_sequence = v_sequence, last_hash = v_current_hash, updated_at = now()
  WHERE chain_id = p_chain_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION insert_audit_event FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION insert_audit_event TO authenticated;

-- ============================================================================
-- SECURITY DEFINER: verify_audit_chain
-- Verifies the entire hash chain for tampering.
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_audit_chain(p_chain_id text DEFAULT 'main')
RETURNS TABLE(
  is_valid boolean,
  total_events bigint,
  verified_events bigint,
  first_invalid_sequence bigint,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_expected_hash text;
  v_previous_hash text;
  v_canonical text;
  v_count bigint := 0;
  v_verified bigint := 0;
  v_first_invalid bigint;
  v_error text := '';
  v_found_invalid boolean := false;
  v_rec record;
BEGIN
  v_previous_hash := 'GENESIS';

  FOR v_rec IN
    SELECT sequence_number, actor_id, action, document_id, target_user_id,
           outcome, request_id, metadata, previous_hash, current_hash
    FROM audit_events
    WHERE chain_id = p_chain_id
    ORDER BY sequence_number ASC
  LOOP
    v_count := v_count + 1;

    IF v_rec.previous_hash != v_previous_hash THEN
      IF NOT v_found_invalid THEN
        v_first_invalid := v_rec.sequence_number;
        v_error := 'Hash chain broken at sequence ' || v_rec.sequence_number::text;
        v_found_invalid := true;
      END IF;
    ELSE
      v_canonical := p_chain_id || '|' || v_rec.sequence_number::text || '|' ||
        COALESCE(v_rec.actor_id::text, 'NULL') || '|' ||
        v_rec.action || '|' ||
        COALESCE(v_rec.document_id::text, 'NULL') || '|' ||
        COALESCE(v_rec.target_user_id::text, 'NULL') || '|' ||
        v_rec.outcome || '|' ||
        COALESCE(v_rec.request_id, '') || '|' ||
        COALESCE(v_rec.metadata::text, '{}') || '|' ||
        v_previous_hash;

      v_expected_hash := encode(digest(v_canonical, 'sha256'), 'hex');

      IF v_rec.current_hash = v_expected_hash THEN
        v_verified := v_verified + 1;
      ELSE
        IF NOT v_found_invalid THEN
          v_first_invalid := v_rec.sequence_number;
          v_error := 'Hash mismatch at sequence ' || v_rec.sequence_number::text;
          v_found_invalid := true;
        END IF;
      END IF;
    END IF;

    v_previous_hash := v_rec.current_hash;
  END LOOP;

  IF v_count > 0 AND NOT v_found_invalid THEN
    DECLARE
      v_head_hash text;
      v_head_seq bigint;
    BEGIN
      SELECT last_hash, last_sequence INTO v_head_hash, v_head_seq
      FROM audit_chain_heads WHERE chain_id = p_chain_id;

      IF v_head_hash IS NULL OR v_head_hash != v_previous_hash OR v_head_seq != v_count THEN
        v_found_invalid := true;
        v_first_invalid := v_head_seq;
        v_error := 'Chain head does not match last event';
      END IF;
    END;
  END IF;

  RETURN QUERY SELECT NOT v_found_invalid, v_count, v_verified, COALESCE(v_first_invalid, 0), v_error;
END;
$$;

REVOKE EXECUTE ON FUNCTION verify_audit_chain FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION verify_audit_chain TO authenticated;

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_doc_permissions_doc ON document_permissions(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_permissions_user ON document_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_permissions_granted ON document_permissions(granted);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_document ON audit_events(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_outcome ON audit_events(outcome);
CREATE INDEX IF NOT EXISTS idx_audit_events_timestamp ON audit_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_sequence ON audit_events(sequence_number);

CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON security_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_acknowledged ON security_alerts(acknowledged);
