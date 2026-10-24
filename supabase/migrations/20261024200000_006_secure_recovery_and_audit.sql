-- Forward-only repair. No user/document rows are deleted or roles reset.
GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT ALL ON public.profiles, public.documents, public.document_versions,
  public.document_permissions, public.organisation_settings, public.audit_events,
  public.audit_chain_heads, public.security_alerts TO service_role;

-- A caller can repair only their own missing profile; identity comes from auth.uid().
CREATE OR REPLACE FUNCTION public.ensure_current_profile()
RETURNS SETOF public.profiles LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.profiles (id, email, display_name, role, status)
  SELECT id, COALESCE(email, ''),
    COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1), ''),
    'viewer', 'active'
  FROM auth.users WHERE id = auth.uid()
  ON CONFLICT (id) DO NOTHING;
  RETURN QUERY SELECT * FROM public.profiles WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_current_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_current_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_account_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND status = 'active';
$$;
REVOKE ALL ON FUNCTION public.current_account_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_account_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_document(p_document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.current_account_role() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.documents d WHERE d.id = p_document_id AND d.status <> 'deleted'
    AND ((d.owner_id = auth.uid() AND public.current_account_role() IN ('owner', 'admin'))
      OR EXISTS (SELECT 1 FROM public.document_permissions p
        WHERE p.document_id = d.id AND p.user_id = auth.uid() AND p.granted))
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_document(uuid) TO authenticated;

-- All mutations of protected resources go through the authorized server endpoints.
REVOKE INSERT, UPDATE, DELETE ON public.documents, public.document_versions,
  public.document_permissions, public.security_alerts FROM authenticated, anon;
REVOKE ALL ON public.audit_events, public.audit_chain_heads FROM anon, authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (display_name) ON public.profiles TO authenticated;
REVOKE INSERT, DELETE ON public.profiles FROM authenticated, anon;
DROP POLICY IF EXISTS select_all_profiles_limited ON public.profiles;
DROP POLICY IF EXISTS select_own_profile ON public.profiles;
CREATE POLICY select_own_profile ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS select_visible_documents ON public.documents;
CREATE POLICY select_visible_documents ON public.documents FOR SELECT TO authenticated
USING (public.can_access_document(id));
DROP POLICY IF EXISTS select_accessible_versions ON public.document_versions;
CREATE POLICY select_accessible_versions ON public.document_versions FOR SELECT TO authenticated
USING (public.can_access_document(document_id));
DROP POLICY IF EXISTS select_own_document_permissions ON public.document_permissions;
CREATE POLICY select_own_document_permissions ON public.document_permissions FOR SELECT TO authenticated
USING (public.current_account_role() IS NOT NULL AND user_id = auth.uid());

DROP POLICY IF EXISTS select_relevant_audit_events ON public.audit_events;
CREATE POLICY select_relevant_audit_events ON public.audit_events FOR SELECT TO authenticated
USING (public.current_account_role() IS NOT NULL AND
  (public.current_account_role() = 'admin' OR actor_id = auth.uid() OR target_user_id = auth.uid()));
DROP POLICY IF EXISTS select_relevant_alerts ON public.security_alerts;
CREATE POLICY select_relevant_alerts ON public.security_alerts FOR SELECT TO authenticated
USING (public.current_account_role() IS NOT NULL AND (actor_id = auth.uid() OR public.current_account_role() = 'admin'));
DROP POLICY IF EXISTS select_org_settings ON public.organisation_settings;
CREATE POLICY select_org_settings ON public.organisation_settings FOR SELECT TO authenticated
USING (public.current_account_role() IS NOT NULL);

-- Prevent forged actors and fabricated events through public RPC calls.
REVOKE ALL ON FUNCTION public.insert_audit_event(uuid,text,uuid,uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_audit_event(uuid,text,uuid,uuid,text,text,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.verify_audit_chain(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(text) TO service_role;

-- Hashed identities must survive removal of accounts and documents unchanged.
-- These are historical references, not mutable foreign keys.
ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_id_fkey;
ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_target_user_id_fkey;
ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_document_id_fkey;
CREATE OR REPLACE FUNCTION public.reject_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN RAISE EXCEPTION 'Audit events are append-only' USING ERRCODE = '42501'; END;
$$;
REVOKE ALL ON FUNCTION public.reject_audit_mutation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_events_append_only ON public.audit_events;
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.reject_audit_mutation();
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_events FROM service_role;
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_chain_sequence ON public.audit_events(chain_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_documents_owner_created ON public.documents(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_active_document_grants ON public.document_permissions(user_id, document_id) WHERE granted;
INSERT INTO public.organisation_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Browser clients have no direct object policies. Files remain server-mediated.
UPDATE storage.buckets SET public = false WHERE id = 'documents';
NOTIFY pgrst, 'reload schema';

DROP POLICY IF EXISTS trustvault_private_storage ON storage.objects;
CREATE POLICY trustvault_private_storage ON storage.objects AS RESTRICTIVE
FOR ALL TO anon, authenticated USING (bucket_id <> 'documents') WITH CHECK (bucket_id <> 'documents');
