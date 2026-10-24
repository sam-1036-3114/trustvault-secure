import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn(), audit: vi.fn(), recovery: vi.fn(), permission: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({
  createClient: () => ({ rpc: () => ({ maybeSingle: mocks.recovery }), auth: { getUser: mocks.getUser }, from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }),
  }) }),
  createServiceClient: () => ({ from: () => ({ select: () => { const query: any = { eq: () => query, maybeSingle: mocks.permission }; return query; } }) }),
}));
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.audit }));
vi.mock('next/headers', () => ({ headers: () => new Headers() }));

import { requireAuthenticatedUser, requireDocumentWriter, requireAdministrator, authoriseDocumentOperation, canReadDocument, canEditDocument, canManageDocumentAccess } from '../lib/auth';
import type { AuthUser, Document } from '../lib/types';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recovery.mockResolvedValue({ data: null, error: null });
  mocks.permission.mockResolvedValue({ data: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.test' } }, error: null });
  mocks.profile.mockResolvedValue({ data: { id: 'user-1', role: 'viewer', status: 'active' } });
});

describe('Server role enforcement', () => {
  it('rejects an unverified session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Invalid session') });
    await expect(requireAuthenticatedUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('rejects users without a profile', async () => {
    mocks.profile.mockResolvedValue({ data: null });
    await expect(requireAuthenticatedUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
  it('blocks viewer writes', async () => {
    await expect(requireDocumentWriter()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it.each(['owner', 'admin'])('allows active %s accounts to write', async role => {
    mocks.profile.mockResolvedValue({ data: { role, status: 'active' } });
    await expect(requireDocumentWriter()).resolves.toMatchObject({ profile: { role } });
  });
  it.each(['viewer', 'owner'])('blocks %s accounts from administration', async role => {
    mocks.profile.mockResolvedValue({ data: { role, status: 'active' } });
    await expect(requireAdministrator()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('allows administrators', async () => {
    mocks.profile.mockResolvedValue({ data: { role: 'admin', status: 'active' } });
    await expect(requireAdministrator()).resolves.toMatchObject({ profile: { role: 'admin' } });
  });
  it('blocks suspended administrators', async () => {
    mocks.profile.mockResolvedValue({ data: { role: 'admin', status: 'suspended' } });
    await expect(requireAdministrator()).rejects.toMatchObject({ code: 'SUSPENDED' });
  });
  it.each(['upload', 'edit', 'delete', 'manage_access'] as const)('blocks viewer %s even with legacy document ownership', async operation => {
    const user = { id: 'user-1', profile: { role: 'viewer' } } as AuthUser;
    const document = { owner_id: 'user-1' } as Document;
    await expect(authoriseDocumentOperation(user, document, operation)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('Document authorization', () => {
  const document = { id: 'doc-1', owner_id: 'user-1', status: 'active' } as Document;
  const account = (role: 'admin' | 'owner' | 'viewer', id = 'user-1', status = 'active') => ({ id, profile: { role, status } } as AuthUser);
  it.each(['admin', 'owner'] as const)('allows %s ownership read/edit/manage', async role => {
    const user = account(role);
    expect(await canReadDocument(user, document)).toBe(true);
    expect(await canEditDocument(user, document)).toBe(true);
    expect(await canManageDocumentAccess(user, document)).toBe(true);
  });
  it('does not grant administrators unrestricted document access', async () => {
    expect(await canReadDocument(account('admin', 'another-user'), document)).toBe(false);
  });
  it('requires explicit sharing for Viewers, even former owners', async () => {
    expect(await canReadDocument(account('viewer'), document)).toBe(false);
  });
  it('allows shared read access', async () => {
    mocks.permission.mockResolvedValue({ data: { granted: true, access_level: 'read' } });
    expect(await canReadDocument(account('viewer', 'viewer-id'), document)).toBe(true);
  });
  it('rejects Viewer editing even with a legacy edit grant', async () => {
    mocks.permission.mockResolvedValue({ data: { granted: true, access_level: 'edit' } });
    expect(await canEditDocument(account('viewer', 'viewer-id'), document)).toBe(false);
    expect(await canManageDocumentAccess(account('viewer'), document)).toBe(false);
  });
  it('allows shared editing for an Owner without granting sharing rights', async () => {
    mocks.permission.mockResolvedValue({ data: { granted: true, access_level: 'edit' } });
    expect(await canEditDocument(account('owner', 'another-owner'), document)).toBe(true);
    expect(await canManageDocumentAccess(account('owner', 'another-owner'), document)).toBe(false);
  });
  it.each(['admin', 'owner', 'viewer'] as const)('denies suspended %s access', async role => {
    expect(await canReadDocument(account(role, 'user-1', 'suspended'), document)).toBe(false);
    expect(await canEditDocument(account(role, 'user-1', 'suspended'), document)).toBe(false);
    expect(await canManageDocumentAccess(account(role, 'user-1', 'suspended'), document)).toBe(false);
  });
  it('denies deleted documents even to the owner', async () => {
    expect(await canReadDocument(account('owner'), { ...document, status: 'deleted' })).toBe(false);
    expect(await canEditDocument(account('owner'), { ...document, status: 'deleted' })).toBe(false);
  });
  it('repairs missing profiles through the authenticated RPC', async () => {
    mocks.profile.mockResolvedValue({ data: null, error: null });
    mocks.recovery.mockResolvedValue({ data: { role: 'viewer', status: 'active' }, error: null });
    await expect(requireAuthenticatedUser()).resolves.toMatchObject({ profile: { role: 'viewer' } });
  });
  it('never repairs a profile when the database query fails', async () => {
    mocks.profile.mockResolvedValue({ data: null, error: { code: 'PGRST205' } });
    await expect(requireAuthenticatedUser()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(mocks.recovery).not.toHaveBeenCalled();
  });
});
