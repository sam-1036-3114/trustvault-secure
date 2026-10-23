# SECURITY.md

## TrustVault Security Policy

### Reporting Security Issues

If you discover a security vulnerability in TrustVault, please report it responsibly by contacting the development team. Do not publicly disclose security issues until they have been addressed.

### Security Design Principles

1. **Server-side authorization is authoritative**: All access control decisions are made on the server. Client-side UI restrictions are for UX only and never for security.

2. **Defence in depth**: Both application-level authorization checks AND database RLS policies enforce access control. Either layer blocking access is sufficient.

3. **No trusted client**: User IDs, roles, and owner IDs supplied by the client are never trusted. The authenticated session is the source of truth for identity.

4. **Append-only audit**: The application role has SELECT-only access to `audit_events`. Inserts go through a SECURITY DEFINER function. No UPDATE or DELETE path exists at the application level.

5. **Immediate revocation**: Permissions are checked on every request. No cached authorization decisions. No long-lived signed URLs.

### Key Security Files

| File | Purpose |
|------|---------|
| `lib/auth.ts` | Authorization service — all access checks |
| `lib/document-service.ts` | Document operations with server-side auth checks |
| `lib/audit.ts` | Audit event logging via SECURITY DEFINER function |
| `lib/validation.ts` | Input validation, file type/signature checks |
| `lib/supabase-server.ts` | Server-only Supabase clients (service role key never exposed) |
| `supabase/migrations/*.sql` | RLS policies, SECURITY DEFINER functions |

### Security Configuration

- **RLS**: Enabled on ALL tables
- **Storage**: Private bucket, no public access
- **Service role key**: Server-only, never imported in client components
- **Session cookies**: HTTP-only, managed by @supabase/ssr
- **File validation**: Extension + MIME type + magic byte signature + size limit + executable rejection

### Known Security Limitations

See THREATS.md for the complete threat model and accepted risks.
