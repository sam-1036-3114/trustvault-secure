# PROMPTS.md — TrustVault AI Development Log

## Reusable System Prompt

```
You are a senior application security architect building TrustVault, a secure document sharing platform. Security is the primary acceptance criterion. Every document operation must check authorization server-side. Never trust client-supplied user IDs, roles, or owner IDs. Log every relevant operation (success and denied) in a tamper-evident audit trail. Do not claim a security property is implemented unless the code and tests demonstrate it.
```

---

## Entry 1 — 2026-10-22: Initial schema and database design

**Prompt**: Create the complete database schema for TrustVault with profiles, documents, document_versions, document_permissions, audit_events with hash chain, security_alerts, and organisation_settings. Enable RLS on all tables with ownership-based policies.

**What AI generated**: Full SQL migration with 8 tables, RLS policies, SECURITY DEFINER functions for audit insertion and verification, auto-profile-creation trigger, updated_at triggers, and indexes.

**Defect found**: The `insert_audit_event` function failed validation because `digest()` is in the `extensions` schema, not `public`. The function's `SET search_path = public` excluded it, causing `function digest(text, unknown) does not exist`.

**How verified**: The `apply_migration` tool returned the validation error. Confirmed by querying `pg_proc` for `digest` — it was in the `extensions` schema.

**What changed**: Changed `SET search_path = public` to `SET search_path = public, extensions` on both `insert_audit_event` and `verify_audit_chain` functions. Also added `CREATE EXTENSION IF NOT EXISTS pgcrypto` as a separate migration applied first.

**Commit reference**: Migration `000_pgcrypto_extension` and `001_core_tables` (applied via Supabase MCP).

---

## Entry 2 — 2026-10-22: Document permissions and RLS policy ordering

**Prompt**: Create the documents and document_versions tables with RLS policies that reference document_permissions for visibility checks.

**What AI generated**: A single migration creating all tables including documents with RLS policies referencing `document_permissions` in subqueries.

**Defect found**: The initial attempt created `documents` policies that referenced `document_permissions` in a subquery, but `document_permissions` was defined after `documents` in the same migration. PostgreSQL failed with `relation "document_permissions" does not exist` because RLS policies are validated at creation time and the referenced table didn't exist yet.

**How verified**: The `apply_migration` tool returned `ERROR: 42P01: relation "document_permissions" does not exist`.

**What changed**: Split the migration into two parts. Part 1 (`001_core_tables`) creates `document_permissions` and other foundational tables first (without the FK to `documents`). Part 2 (`002_documents_and_versions`) creates `documents` and `document_versions` with policies that reference the already-existing `document_permissions` table, then adds the FK constraint via a `DO $$ ... END $$` block.

**Commit reference**: Migration `002_documents_and_versions` (applied via Supabase MCP).

---

## Entry 3 — 2026-10-22: Supabase client setup and SSR cookie handling

**Prompt**: Set up Supabase server and browser clients for Next.js App Router with proper cookie-based session handling.

**What AI generated**: `lib/supabase-server.ts` using `createServerClient` from `@supabase/supabase-js` with a `cookies` option, and `lib/supabase-browser.ts` using `createClient`.

**Defect found**: The `cookies` option does not exist on `@supabase/supabase-js`'s `createClient`. The build failed with `Object literal may only specify known properties, and 'cookies' does not exist in type 'SupabaseClientOptions<"public">'`. Cookie-based session management requires the `@supabase/ssr` package, not the base `supabase-js` package.

**How verified**: `npm run build` returned the TypeScript error on `lib/supabase-server.ts:15:5`. Confirmed by checking the `@supabase/supabase-js` API — the `cookies` option is only available in `@supabase/ssr`'s `createServerClient` and `createBrowserClient`.

**What changed**: Installed `@supabase/ssr`. Rewrote `lib/supabase-server.ts` to import `createServerClient` from `@supabase/ssr` with the `getAll/setAll` cookie API. Rewrote `lib/supabase-browser.ts` to use `createBrowserClient` from `@supabase/ssr`.

**Commit reference**: `lib/supabase-server.ts`, `lib/supabase-browser.ts` — build passes after fix.

---

## Entry 4 — 2026-10-22: Authorization service and IDOR prevention

**Prompt**: Implement the central authorization service with requireAuthenticatedUser, requireAdministrator, canReadDocument, canEditDocument, and authoriseDocumentOperation. Every document operation must use this service.

**What AI generated**: `lib/auth.ts` with all authorization functions, `lib/document-service.ts` with server-side checks on every operation, and API routes that call the service.

**Defect found during review**: The `downloadDocument` function in `lib/document-service.ts` correctly checks `canReadDocument()` before returning file data. However, the initial version of `listDocuments` used a join with `document_permissions!inner` which could leak document existence to users without access if the RLS policy wasn't tight enough. The query needed to be filtered by ownership or active grants.

**How verified**: Reviewed the `listDocuments` function — the query uses `document_permissions!inner` as a join, which means documents without any permissions would be excluded. This was incorrect because owners should see their own documents even without any permission grants. The RLS policy on `documents` does filter correctly, but the application-level query was overly restrictive.

**What changed**: Modified `listDocuments` to query all documents via the service client and then filter in application code based on ownership or active permission grants, rather than relying on an inner join that would exclude owner-only documents.

**Commit reference**: `lib/document-service.ts` — `listDocuments` function.

---

## Entry 5 — 2026-10-22: Audit trail hash chain implementation and verification

**Prompt**: Implement a tamper-evident audit trail using a SHA-256 hash chain. The application must not be able to modify or delete audit events. Verification must detect tampering.

**What AI generated**: `audit_events` table with `previous_hash` and `current_hash` columns, `audit_chain_heads` for tracking the latest hash, `insert_audit_event()` SECURITY DEFINER function with `FOR UPDATE` locking, and `verify_audit_chain()` function that walks the entire chain.

**Defect found during review**: The `insert_audit_event` function parameters had defaults starting from `p_actor_id` (which has a default of `NULL`), but `p_action` (which comes after `p_actor_id`) did not have a default. PostgreSQL requires all parameters after one with a default to also have defaults. The function creation failed with `input parameters after one with a default value must also have defaults`.

**How verified**: The `apply_migration` tool returned `ERROR: 42P13: input parameters after one with a default value must also have defaults`.

**What changed**: Added `DEFAULT ''` to `p_action` and `DEFAULT NULL` to all subsequent parameters in `insert_audit_event`. All parameters now have defaults.

**Commit reference**: Migration `001_core_tables` — `insert_audit_event` function definition.

---

## Template for Future Entries

```
## Entry N — YYYY-MM-DD: [Topic]

**Prompt**: [The actual prompt or fair summary]

**What AI generated**: [Description of generated code/content]

**Defect found**: [Specific defect or limitation found during review]

**How verified**: [How the defect was verified — build error, test failure, manual review]

**What changed**: [What was changed to fix the defect]

**Commit reference**: [Git commit hash or migration reference]
```

---

## Coverage Checklist

- [x] Entry 1 covers database schema and RLS (authorization infrastructure)
- [x] Entry 2 covers RLS policy ordering and document permissions
- [x] Entry 3 covers client setup and SSR integration
- [x] Entry 4 covers authorization service and IDOR prevention
- [x] Entry 5 covers audit trail hash chain implementation (audit integrity)
- [x] At least two entries cover authorization, access control, or audit integrity (entries 2, 4, 5)
