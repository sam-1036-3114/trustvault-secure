# TrustVault

## Secure Document Sharing with a Tamper-Evident Audit Trail

TrustVault is a full-stack enterprise security application built for the Snovasys Fresher Hiring Challenge 2026. It provides secure document upload, per-document permissions, immediate revocation, and a tamper-evident audit trail backed by SHA-256 hash chains.

## Architecture

### Stack
- **Frontend**: Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons
- **Backend**: Next.js server routes (API routes)
- **Database**: Supabase PostgreSQL with Row Level Security
- **Auth**: Supabase Auth (email/password)
- **Storage**: Private Supabase Storage bucket (no public access)
- **Validation**: Zod for request validation, file signature checks for uploads

### Design Principles
1. **Security first**: Every protected operation checks authorisation server-side
2. **Defence in depth**: Server-side checks AND database RLS policies
3. **No trusted client**: Client-supplied user IDs, roles, or owner IDs are never trusted
4. **Append-only audit**: Application roles cannot UPDATE or DELETE audit events
5. **Immediate revocation**: Permissions are rechecked on every request

## Permission Model

### Roles

| Role | Capabilities |
|------|-------------|
| Administrator | Manage users, view security dashboard, change roles, suspend accounts |
| Document Owner | Upload, edit, delete own documents, grant/revoke per-document access |
| Viewer | Read/download only documents with an active grant |

### Permission Matrix

| Operation | Admin | Owner | Viewer with Read | Viewer with Edit |
|-----------|-------|-------|-----------------|-----------------|
| View document metadata | Yes (admin dashboard) | Own docs | Granted docs | Granted docs |
| Download document | No (unless granted) | Own docs | Granted docs | Granted docs |
| Edit document metadata | No | Own docs | No | Granted docs |
| Delete document | No | Own docs | No | No |
| Grant/revoke access | No | Own docs | No | No |
| Manage users | Yes | No | No | No |

### How Access Is Checked

Every document operation follows this sequence:
1. Authenticate the user via Supabase session
2. Check account status (suspended accounts are blocked)
3. Load the document from the database using the service role client
4. Check if the user is the owner OR has an active permission grant
5. For edit operations, verify the grant is `edit` level
6. Record the outcome (success or denied) in the audit trail
7. Return the result

Authorization code lives in `lib/auth.ts` with functions:
- `requireAuthenticatedUser()` — throws if not signed in
- `requireAdministrator()` — throws if not admin role
- `canReadDocument(userId, document)` — checks ownership or active read grant
- `canEditDocument(userId, document)` — checks ownership or active edit grant
- `canManageDocumentAccess(userId, document)` — checks ownership only

## How Immediate Revocation Works

1. Permissions are stored per-document and per-user in `document_permissions`
2. The `granted` boolean flag controls access
3. On every protected request (download, preview, metadata), the server queries the current grant state
4. No long-lived signed URLs are used — all file access is server-mediated
5. When `revokePermission()` sets `granted = false`, the next request immediately fails
6. No caching of authorization decisions — each request hits the database

**Limitation**: Already-downloaded copies cannot be remotely recalled. Revocation prevents future access but does not delete copies on user devices.

## How Audit Integrity Works

### Hash Chain
1. Each audit event contains a `previous_hash` and `current_hash`
2. `current_hash = SHA-256(canonical_event_data || previous_hash)`
3. The canonical form includes: chain_id, sequence_number, actor_id, action, document_id, target_user_id, outcome, request_id, metadata, previous_hash
4. A `audit_chain_heads` table tracks the latest hash and sequence number
5. The `insert_audit_event()` function uses `FOR UPDATE` row locking to prevent concurrent chain corruption

### Verification
- `verify_audit_chain()` walks the entire chain and recomputes every hash
- Detects modification, deletion, or reordering of events
- Returns `{ is_valid, total_events, verified_events, first_invalid_sequence, error_message }`

### Limitations
- An attacker with direct database superuser privileges could theoretically rewrite the chain
- For stronger evidence, design recommends exporting checkpoints to an external immutable store
- The hash chain proves integrity against application-level tampering, not privileged DB access

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
```bash
cp .env.example .env.local
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (server-only)
- `SUPABASE_DB_URL` — PostgreSQL connection string

### 3. Apply Database Migrations
Migrations are applied via the Supabase MCP tools. The migration files are in `supabase/migrations/`:
1. `000_pgcrypto_extension.sql` — enables pgcrypto for SHA-256
2. `001_core_tables.sql` — profiles, organisation_settings, document_permissions, audit_events, audit_chain_heads, security_alerts + SECURITY DEFINER functions
3. `002_documents_and_versions.sql` — documents, document_versions + RLS policies
4. `003_storage_bucket.sql` — private storage bucket

### 4. Create the First Administrator
1. Sign up via the app's `/login?mode=signup` page
2. Use the Supabase dashboard to manually set the user's role to `admin` in the `profiles` table:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'your-email@example.com';
   ```
3. Sign out and sign back in to pick up the new role

### 5. Demo Data
Demo accounts are created through the signup flow. After creating accounts, use the admin panel to assign roles:
- Create 3 accounts: admin@trustvault.demo, owner@trustvault.demo, viewer@trustvault.demo
- Set the first account as admin via SQL (see step 4)
- Use the admin panel to set the second as owner and third as viewer

**Demo passwords**: Use a secure password manager. Never commit real credentials to the repository.

### 6. Run the Development Server
```bash
npm run dev
```

### 7. Run Tests
```bash
npm test          # Run security tests
npm run typecheck # TypeScript checking
npm run build     # Production build
```

### 8. Deploy to Vercel
1. Push to a Git repository
2. Import into Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

## API Documentation

### Authentication
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/signup` | None | Create account |
| POST | `/api/auth/signin` | None | Sign in |
| POST | `/api/auth/signout` | Session | Sign out |
| GET | `/api/auth/profile` | Session | Get current user profile |

### Documents
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/documents` | Authenticated | List visible documents |
| POST | `/api/documents` | Authenticated | Upload document (multipart/form-data) |
| GET | `/api/documents/:id` | Authenticated + read access | Get document detail |
| DELETE | `/api/documents/:id` | Owner only | Delete document |
| GET | `/api/documents/:id/download` | Authenticated + read access | Download file |
| PATCH | `/api/documents/:id/metadata` | Authenticated + edit access | Update metadata |
| GET | `/api/documents/:id/permissions` | Owner only | List permissions |
| POST | `/api/documents/:id/permissions` | Owner only | Grant access |
| DELETE | `/api/permissions/:docId/:userId` | Owner only | Revoke access |

### Audit
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/audit` | Authenticated | List visible audit events |
| GET | `/api/audit/verify` | Authenticated | Verify chain integrity |

### Admin
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/admin/stats` | Admin | Security dashboard stats |
| GET | `/api/admin/users` | Admin | List all users |
| PATCH | `/api/admin/users` | Admin | Update user role/status |

### Other
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/health` | None | Health check |
| GET | `/api/users/search?q=` | Authenticated | Search active users |

## Five-Minute Demo Script

1. **0:00 — Introduction**: Show the landing page, explain the three roles and per-document permission model
2. **0:45 — Secure Sharing**: Sign in as owner, upload a document, grant read access to a viewer, show the viewer can access it
3. **1:45 — Attack Demonstration**: Sign in as an unauthorized user, attempt to access the document by modifying the URL — show the server blocks it and logs a denied audit event
4. **2:30 — Revocation**: Revoke the viewer's access, show the next request fails immediately
5. **3:15 — Audit Trail**: Show the audit page, demonstrate hash-chain verification
6. **4:00 — Admin Dashboard**: Sign in as admin, show security metrics and user management
7. **4:30 — Q&A**: Discuss threat model, limitations, and security design decisions

## Known Security Limitations

1. **No malware scanning**: File signature validation catches MIME spoofing but does not scan for malware. A quarantine workflow should be added for production use.
2. **Privileged DB tampering**: An attacker with direct database superuser access could rewrite the audit chain. External checkpoint anchoring is recommended for high-assurance deployments.
3. **Downloaded copies**: Revocation prevents future access but cannot recall files already downloaded to user devices.
4. **No rate limiting**: The current implementation does not include API rate limiting. Production deployments should add rate limiting middleware.
5. **No CSRF protection on API**: API routes use session cookies but do not implement CSRF tokens. This is acceptable for same-origin API calls but should be addressed if cross-origin access is needed.
6. **SVG/HTML preview**: Document previews are not implemented; if added, SVG and HTML files must be served with `Content-Type: text/plain` or sanitized to prevent stored XSS.

## Implemented Features

- [x] User authentication (sign up, sign in, sign out)
- [x] Three roles: admin, owner, viewer
- [x] Document upload with file type, size, and signature validation
- [x] Document listing with search and category filter
- [x] Document detail with metadata, permissions, and version history
- [x] Per-document permission grants (read/edit)
- [x] Immediate permission revocation
- [x] Document download (server-mediated, authorization checked per request)
- [x] Document metadata editing (owner or edit-grant only)
- [x] Document deletion (owner only)
- [x] Tamper-evident audit trail with SHA-256 hash chain
- [x] Audit chain integrity verification
- [x] Admin security dashboard with real metrics
- [x] User management (role and status changes)
- [x] Audit trail explorer with outcome filtering
- [x] Profile and session management page
- [x] Landing page with product explanation
- [x] Access denied, not found, and error pages
- [x] Dark/light theme support
- [x] Responsive layout (mobile, tablet, desktop)
- [x] Health endpoint (`/api/health`)
- [x] Private storage bucket (no public access)
- [x] RLS policies on all tables
- [x] Column-level privileges prevent role escalation via Data API
- [x] SECURITY DEFINER functions for audit insertion and verification
- [x] Server-side validation with Zod
- [x] File signature (magic byte) verification

## Unimplemented Features

- [ ] AI recommendation assistant (designed but not wired to external AI provider)
- [ ] Playwright E2E tests (Vitest security tests are included)
- [ ] Document versioning upload (version table exists but multi-version upload UI not built)
- [ ] Document archiving (status field exists but archive workflow not built)
- [ ] Rate limiting middleware
- [ ] CSRF token protection
- [ ] Malware scanning integration
- [ ] External audit checkpoint anchoring
