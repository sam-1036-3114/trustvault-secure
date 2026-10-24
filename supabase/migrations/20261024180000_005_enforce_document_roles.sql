-- Restore missing profiles without changing existing roles or status.
INSERT INTO public.profiles (id, email, display_name, role, status)
SELECT id, COALESCE(email, ''),
       COALESCE(raw_user_meta_data->>'display_name', split_part(email, '@', 1), ''),
       'viewer', 'active'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Restrictive policies also constrain any existing permissive ownership policies.
DROP POLICY IF EXISTS document_writer_roles ON public.documents;
CREATE POLICY document_writer_roles ON public.documents AS RESTRICTIVE
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active'))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active' AND p.role IN ('owner', 'admin')));

DROP POLICY IF EXISTS document_update_roles ON public.documents;
CREATE POLICY document_update_roles ON public.documents AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active' AND p.role IN ('owner', 'admin')));

DROP POLICY IF EXISTS document_delete_roles ON public.documents;
CREATE POLICY document_delete_roles ON public.documents AS RESTRICTIVE
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active' AND p.role IN ('owner', 'admin')));

DROP POLICY IF EXISTS version_writer_roles ON public.document_versions;
CREATE POLICY version_writer_roles ON public.document_versions AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.status = 'active' AND p.role IN ('owner', 'admin')));
