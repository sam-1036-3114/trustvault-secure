/*
# TrustVault Documents Tables — Part 2

## Overview
Creates the documents and document_versions tables with RLS policies that reference
the document_permissions table created in Part 1.

## New Tables
1. documents — document metadata; binary content lives in private Supabase Storage
2. document_versions — version history for each document

## Security
- RLS enabled on both tables
- Users can only see documents they own OR have an active permission grant for
- Only owners can insert, update, delete documents
- Version history follows the same access rules as documents
- Only owners can create new versions
- Foreign key added from document_permissions.document_id to documents.id

## Important Notes
1. storage_key is an opaque UUID path, not a user-supplied filename
2. Document status includes 'active', 'archived', 'deleted' — deleted docs are hidden from listing
3. Version tracking maintains version_number on the documents table
*/

-- ============================================================================
-- DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  storage_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  version_number int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO authenticated;

-- Users can see documents they own OR have an active permission grant for
DROP POLICY IF EXISTS "select_visible_documents" ON documents;
CREATE POLICY "select_visible_documents" ON documents FOR SELECT
  TO authenticated USING (
    status != 'deleted' AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM document_permissions dp
        WHERE dp.document_id = documents.id
        AND dp.user_id = auth.uid()
        AND dp.granted = true
      )
    )
  );

-- Users can insert documents they own
DROP POLICY IF EXISTS "insert_own_documents" ON documents;
CREATE POLICY "insert_own_documents" ON documents FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

-- Only owners can update their documents
DROP POLICY IF EXISTS "update_own_documents" ON documents;
CREATE POLICY "update_own_documents" ON documents FOR UPDATE
  TO authenticated USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Only owners can delete their documents
DROP POLICY IF EXISTS "delete_own_documents" ON documents;
CREATE POLICY "delete_own_documents" ON documents FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- ============================================================================
-- DOCUMENT_VERSIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  storage_key text NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_summary text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON document_versions TO authenticated;

-- Users can see versions for documents they can access
DROP POLICY IF EXISTS "select_accessible_versions" ON document_versions;
CREATE POLICY "select_accessible_versions" ON document_versions FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_versions.document_id
      AND d.status != 'deleted'
      AND (
        d.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM document_permissions dp
          WHERE dp.document_id = d.id
          AND dp.user_id = auth.uid()
          AND dp.granted = true
        )
      )
    )
  );

-- Only owners can create new versions
DROP POLICY IF EXISTS "insert_owner_versions" ON document_versions;
CREATE POLICY "insert_owner_versions" ON document_versions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = document_versions.document_id
      AND d.owner_id = auth.uid()
    )
  );

-- ============================================================================
-- Add FK from document_permissions to documents
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'document_permissions_document_id_fkey'
    AND table_name = 'document_permissions'
  ) THEN
    ALTER TABLE document_permissions
    ADD CONSTRAINT document_permissions_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add FK from audit_events.document_id to documents
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'audit_events_document_id_fkey'
    AND table_name = 'audit_events'
  ) THEN
    ALTER TABLE audit_events
    ADD CONSTRAINT audit_events_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add FK from security_alerts.document_id to documents
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'security_alerts_document_id_fkey'
    AND table_name = 'security_alerts'
  ) THEN
    ALTER TABLE security_alerts
    ADD CONSTRAINT security_alerts_document_id_fkey
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_doc_versions_doc ON document_versions(document_id);

-- ============================================================================
-- TRIGGER: documents updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- AUDIT EVENT POLICIES (now that documents table exists for ownership checks)
-- ============================================================================
DROP POLICY IF EXISTS "select_relevant_audit_events" ON audit_events;
CREATE POLICY "select_relevant_audit_events" ON audit_events FOR SELECT
  TO authenticated USING (
    actor_id = auth.uid()
    OR target_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = audit_events.document_id
      AND d.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );
