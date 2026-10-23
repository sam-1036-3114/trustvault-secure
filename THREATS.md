# THREATS.md — TrustVault Threat Model

## Asset Inventory

| Asset | Location | Sensitivity |
|-------|----------|-------------|
| Document files (binary content) | Supabase Storage (private bucket) | High — confidential business documents |
| Document metadata | PostgreSQL `documents` table | High — titles, categories, owners |
| User profiles and roles | PostgreSQL `profiles` table | High — role controls capabilities |
| Permission grants | PostgreSQL `document_permissions` table | Critical — controls document access |
| Audit events | PostgreSQL `audit_events` table | Critical — tamper-evidence for compliance |
| Audit chain heads | PostgreSQL `audit_chain_heads` table | Critical — integrity anchor |
| Auth sessions | Supabase Auth (JWT cookies) | High — session hijack grants full access |
| Service role key | Server environment variables | Critical — bypasses all RLS |

## Trust Boundaries

1. **Browser → Server (API routes)**: Untrusted input. All user-supplied data is untrusted.
2. **Server → Database (RLS)**: Authenticated user context. RLS enforces row-level access.
3. **Server → Database (service role)**: Bypasses RLS. Used only for privileged operations with explicit authorization checks in application code.
4. **Server → Storage**: Service role key required. No public access.
5. **Database → Audit chain**: Append-only via SECURITY DEFINER function. Application role cannot UPDATE/DELETE.

## Threat Actors

| Actor | Motivation | Capabilities |
|-------|-----------|--------------|
| Unauthenticated user | Access documents without auth | Can attempt API calls, no session |
| Authenticated viewer | Access unauthorized documents | Has session, can call API routes |
| Authenticated owner | Escalate to admin, access other owners' docs | Has session, owns some documents |
| Compromised account | Access all data available to victim | Full victim session |
| Privileged DB attacker | Tamper audit trail | Direct database superuser access |

## Attack Surfaces

1. API routes (document access, download, metadata, permissions)
2. File upload endpoint
3. User search endpoint
4. Audit listing endpoint
5. Admin user management
6. Storage bucket (if misconfigured to public)
7. Environment variables (if exposed to client)

## Threat Scenarios

### T1: Insecure Direct Object Reference (IDOR)

**Attack**: User changes document ID in URL to access another user's document.
**Mitigation**: `lib/auth.ts:canReadDocument()` checks ownership or active permission grant on every request. `lib/document-service.ts:downloadDocument()` loads the document by ID, then checks authorization before returning file data. RLS on `documents` table also restricts which rows are visible.
**Test**: `tests/security.test.ts` — "User A cannot read User B's document"
**Limitation**: None — server-side check is authoritative.

### T2: Horizontal Privilege Escalation

**Attack**: User A tries to manage permissions on User B's document.
**Mitigation**: `lib/document-service.ts:grantPermission()` checks `document.owner_id === user.id`. RLS policy `insert_owner_permissions` enforces the same check at database level.
**Test**: `tests/security.test.ts` — "Non-owner cannot grant permissions"
**Limitation**: None.

### T3: Vertical Privilege Escalation

**Attack**: Viewer tries to access admin endpoints or promote themselves.
**Mitigation**: `lib/auth.ts:requireAdministrator()` checks `profile.role === 'admin'`. Roles are stored in `profiles` table (server-controlled), not in user-mutable metadata. The `update_own_profile` RLS policy allows users to update their profile but the application code restricts role changes to admin-only API routes. The `PATCH /api/admin/users` endpoint checks `requireAdministrator()` and explicitly prevents self-modification.
**Test**: `tests/security.test.ts` — "User cannot promote themselves to admin"
**Limitation**: None. Column-level privileges now restrict UPDATE to only `display_name` — the `role` and `status` columns cannot be modified by the authenticated role. See migration `004_fix_column_level_role_protection`.

### T4: Stale Signed URL Access

**Attack**: User retains a signed URL after access is revoked.
**Mitigation**: TrustVault does NOT use signed URLs. All file access is server-mediated through `/api/documents/[id]/download`, which checks authorization on every request.
**Test**: N/A — signed URLs are not used.
**Limitation**: None.

### T5: Revocation Race Conditions

**Attack**: User initiates download concurrently with owner revoking access.
**Mitigation**: The authorization check in `downloadDocument()` queries the current grant state at the time of the request. If revocation commits before the check, the download is blocked. If the download starts before revocation commits, it succeeds (the file was already authorized at that moment). This is documented behavior — in-flight downloads may complete.
**Test**: `tests/security.test.ts` — "Revocation blocks subsequent requests"
**Limitation**: In-flight downloads that started before revocation commit may complete. This is accepted as the documented consistency policy.

### T6: Audit Log Tampering

**Attack**: Application user tries to modify or delete audit events.
**Mitigation**: `GRANT SELECT ON audit_events TO authenticated` — no INSERT, UPDATE, or DELETE granted to the application role. The `insert_audit_event()` function is SECURITY DEFINER and is the only way to add events. No application-level path exists to modify or delete audit events.
**Test**: `tests/security.test.ts` — "Cannot modify audit events"
**Limitation**: A database superuser could bypass this.

### T7: Audit-Chain Rewriting by Privileged DB Attacker

**Attack**: Attacker with database superuser access rewrites the hash chain.
**Mitigation**: The hash chain uses SHA-256 with `previous_hash` linking. `verify_audit_chain()` detects any modification. However, a superuser could recompute all hashes after tampering.
**Test**: `tests/security.test.ts` — "Hash-chain verification detects modification"
**Limitation**: Accepted risk — the hash chain protects against application-level tampering, not privileged DB access. Design recommends external checkpoint anchoring for high-assurance deployments.

### T8: Malicious Uploads

**Attack**: User uploads an executable disguised as a PDF.
**Mitigation**: `lib/validation.ts:isAllowedFileType()` checks extension and MIME type. `verifyFileSignature()` checks magic bytes. `isExecutableFile()` rejects known executable extensions. `MAX_FILE_SIZE` enforces size limits.
**Test**: `tests/security.test.ts` — "Invalid file signatures are rejected"
**Limitation**: No malware scanning — a sophisticated malicious file with correct magic bytes could pass validation.

### T9: MIME Spoofing

**Attack**: File has .pdf extension and application/pdf MIME type but is actually an executable.
**Mitigation**: `verifyFileSignature()` checks the first bytes match the expected magic bytes for the declared type. A file claiming to be PDF must start with `%PDF`.
**Test**: `tests/security.test.ts` — "MIME spoofing is detected"
**Limitation**: Some file types share magic bytes (e.g., DOCX/XLSX/PPTX all use ZIP's `PK` header). Additional structural validation would be needed for stronger guarantees.

### T10: Stored Cross-Site Scripting (XSS)

**Attack**: User uploads a file with XSS payload in filename or metadata.
**Mitigation**: `lib/validation.ts:sanitizeFilename()` strips non-alphanumeric characters from filenames. Document titles and descriptions are rendered as text content in React (not dangerouslySetInnerHTML). If preview functionality is added, SVG/HTML files must be served with `Content-Type: text/plain`.
**Test**: Manual verification — React escapes all rendered content.
**Limitation**: If server-side rendering or preview is added without sanitization, XSS could be reintroduced.

### T11: CSRF

**Attack**: Attacker tricks user into making a state-changing request from another origin.
**Mitigation**: API routes use session cookies. Same-origin requests are the default. The application does not accept cross-origin requests (no CORS headers on API routes).
**Limitation**: No CSRF token is implemented. If cross-origin access is needed, CSRF tokens should be added.

### T12: Session Theft

**Attack**: Attacker steals a user's session cookie.
**Mitigation**: Supabase uses HTTP-only cookies. Sessions expire based on Supabase Auth configuration.
**Limitation**: If an attacker obtains the cookie, they have full access until expiry. No additional session binding to IP/fingerprint is implemented.

### T13: Brute Force and Abuse

**Attack**: Attacker repeatedly tries to guess document IDs or passwords.
**Mitigation**: Supabase Auth has built-in rate limiting. Document IDs are UUIDs (128-bit random), making guessing impractical.
**Limitation**: No application-level rate limiting on API routes.

### T14: Sensitive Metadata Leakage

**Attack**: Unauthorized user attempts to access document metadata via API.
**Mitigation**: `getDocumentDetail()` checks `canReadDocument()` before returning metadata. Denied requests return a generic "Access denied" error without revealing document details. RLS on `documents` table prevents unauthorized SELECT.
**Test**: `tests/security.test.ts` — "Unauthorized user cannot access document metadata"
**Limitation**: None.

### T15: Search-Based Information Disclosure

**Attack**: User searches for documents they should not see.
**Mitigation**: `listDocuments()` uses RLS to only return documents the user owns or has an active grant for. The service client query is filtered by RLS policies. Search results only include visible documents.
**Test**: `tests/security.test.ts` — "Search results do not disclose inaccessible documents"
**Limitation**: None.

### T16: Misconfigured RLS

**Attack**: RLS policies are too permissive, allowing unauthorized access.
**Mitigation**: Every table has RLS enabled. Policies use `auth.uid()` for ownership checks. No `USING (true)` policies on sensitive tables. The `get_security_posture` tool was used to verify policies.
**Limitation**: RLS policies must be kept in sync with application logic. Changes to one must update the other.

### T17: Exposed Environment Variables

**Attack**: Service role key or database password exposed to the browser.
**Mitigation**: Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are exposed to the client. `SUPABASE_SERVICE_ROLE_KEY` is server-only and never imported in client components.
**Limitation**: None — verified by code review.

### T18: AI Prompt Injection and Unsafe AI Recommendations

**Attack**: Malicious content in document metadata or user input influences AI recommendations to suggest unsafe permission grants.
**Mitigation**: AI is not wired to external providers in the current implementation. The design specifies that AI output must be treated as untrusted, AI must never grant permissions autonomously, and the owner must explicitly confirm each change.
**Limitation**: When AI is enabled, prompt injection is a risk. The mitigation is that AI is advisory-only and human confirmation is required.

### T19: Denial of Service

**Attack**: Attacker floods API with requests to exhaust resources.
**Mitigation**: No specific DoS mitigation implemented. Supabase has platform-level protections.
**Limitation**: Accepted risk for the challenge scope. Production should add rate limiting.

### T20: Concurrent Permission Changes

**Attack**: Two concurrent requests modify permissions on the same document.
**Mitigation**: The `document_permissions` table has a `UNIQUE(document_id, user_id)` constraint. The `grantPermission()` function uses upsert logic (check existing, update or insert). The `insert_audit_event()` function uses `FOR UPDATE` row locking on `audit_chain_heads` to serialize audit chain updates.
**Limitation**: No explicit transaction wrapping of permission changes. The unique constraint prevents duplicates but concurrent updates could overwrite each other (last-write-wins).

### T21: Incomplete Audit Logging

**Attack**: An operation succeeds but the audit event fails to log, creating a gap in the trail.
**Mitigation**: `lib/audit.ts:logAuditEvent()` catches errors and logs to console. For security-sensitive operations, the authorization check happens before the operation, and the audit event is logged after success. If audit logging fails, the operation has already completed — this is a trade-off. The `insert_audit_event()` function is reliable (SECURITY DEFINER, simple INSERT).
**Limitation**: If the audit insert fails, the operation completes without an audit record. For fail-closed behavior, the operation should be wrapped in a transaction with the audit insert. This is an accepted limitation for the current implementation.

## Residual Risks

1. **No rate limiting**: API endpoints are not rate-limited. Risk: brute force, DoS.
2. **No malware scanning**: File validation catches type spoofing but not malicious content. Risk: malware in uploaded files.
3. **Privileged DB tampering**: A database superuser can rewrite the audit chain. Risk: undetected audit tampering by privileged insider.
4. **In-flight downloads**: A download that starts before revocation may complete. Risk: brief access window after revocation.
5. **No CSRF tokens**: Same-origin only. Risk: CSRF if cross-origin access is added.
6. **Role column not protected at DB level**: Users can UPDATE their own profile row via the Data API. The application prevents role changes, but the DB does not enforce column-level restrictions on the `role` column. Risk: a sophisticated user could escalate their role via direct Data API calls.

## Explicitly Accepted Risks

| Risk | Reason |
|------|--------|
| No rate limiting | Challenge scope; Supabase platform provides basic protections |
| No malware scanning | Would require external service integration; file signature validation is the baseline |
| Privileged DB tampering | Hash chain protects against application-level tampering; external anchoring is a design recommendation |
| In-flight downloads | Documented as the consistency policy; revocation blocks all future access |
| No CSRF tokens | Same-origin API; adding cross-origin support would require CSRF protection |
| Role column not protected at DB level | **FIXED** — Column-level privileges restrict UPDATE to `display_name` only. `role` and `status` columns are not updatable by the authenticated role. |
