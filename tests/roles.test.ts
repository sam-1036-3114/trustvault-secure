import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), profile: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser }, from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }),
  }) }),
  createServiceClient: vi.fn(),
}));
vi.mock('@/lib/audit', () => ({ logAuditEvent: mocks.audit }));
vi.mock('next/headers', () => ({ headers: () => new Headers() }));

import { requireAuthenticatedUser, requireDocumentWriter, requireAdministrator, authoriseDocumentOperation } from '../lib/auth';
import type { AuthUser, Document } from '../lib/types';

beforeEach(() => {
  vi.clearAllMocks();
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
