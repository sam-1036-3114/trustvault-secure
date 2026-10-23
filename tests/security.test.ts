import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  setupTestUsers,
  apiCall,
  uploadTestDocument,
  makeServiceClient,
  TEST_PASSWORD,
  randomEmail,
  createTestUser,
  setUserRole,
  getTestSession,
  deleteTestUser,
} from './helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

let testCtx: Awaited<ReturnType<typeof setupTestUsers>>;

describe('TrustVault Security Tests', () => {
  beforeAll(async () => {
    testCtx = await setupTestUsers();
  });

  afterAll(async () => {
    await testCtx.cleanup();
  });

  describe('Authentication', () => {
    it('should reject unauthenticated document access', async () => {
      const res = await apiCall('GET', '/api/documents');
      expect(res.status).toBe(401);
    });

    it('should reject unauthenticated document download', async () => {
      const res = await apiCall('GET', '/api/documents/00000000-0000-0000-0000-000000000000/download');
      expect([401, 403]).toContain(res.status);
    });

    it('should reject unauthenticated audit access', async () => {
      const res = await apiCall('GET', '/api/audit');
      expect(res.status).toBe(401);
    });
  });

  describe('Document Access Control (IDOR)', () => {
    let ownerDocId: string;

    beforeAll(async () => {
      const upload = await uploadTestDocument(testCtx.owner, 'Owner Secret Doc');
      expect(upload.status).toBe(201);
      ownerDocId = upload.data.document.id;
    });

    it('should allow owner to access their own document', async () => {
      const res = await apiCall('GET', `/api/documents/${ownerDocId}`, { cookies: testCtx.owner.cookies });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.document).toBeTruthy();
      expect(json.document.title).toBe('Owner Secret Doc');
    });

    it('should block viewer from accessing unshared document', async () => {
      const res = await apiCall('GET', `/api/documents/${ownerDocId}`, { cookies: testCtx.viewer.cookies });
      expect([403, 404]).toContain(res.status);
    });

    it('should block viewer from downloading unshared document', async () => {
      const res = await apiCall('GET', `/api/documents/${ownerDocId}/download`, { cookies: testCtx.viewer.cookies });
      expect([403, 404]).toContain(res.status);
    });

    it('should block another owner from accessing unshared document', async () => {
      const res = await apiCall('GET', `/api/documents/${ownerDocId}`, { cookies: testCtx.other.cookies });
      expect([403, 404]).toContain(res.status);
    });

    it('should block guessed document ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await apiCall('GET', `/api/documents/${fakeId}`, { cookies: testCtx.viewer.cookies });
      expect([403, 404]).toContain(res.status);
    });

    it('should block non-owner from deleting document', async () => {
      const res = await apiCall('DELETE', `/api/documents/${ownerDocId}`, { cookies: testCtx.viewer.cookies });
      expect([403, 404]).toContain(res.status);
    });

    it('should block non-owner from updating metadata', async () => {
      const res = await apiCall('PATCH', `/api/documents/${ownerDocId}/metadata`, {
        cookies: testCtx.viewer.cookies,
        body: { title: 'Hacked Title' },
      });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('Permission Management', () => {
    let sharedDocId: string;

    beforeAll(async () => {
      const upload = await uploadTestDocument(testCtx.owner, 'Shared Doc');
      sharedDocId = upload.data.document.id;
    });

    it('should block viewer from granting permissions', async () => {
      const res = await apiCall('POST', `/api/documents/${sharedDocId}/permissions`, {
        cookies: testCtx.viewer.cookies,
        body: { user_id: testCtx.other.user.id, access_level: 'read' },
      });
      expect([403, 400]).toContain(res.status);
    });

    it('should allow owner to grant read access', async () => {
      const res = await apiCall('POST', `/api/documents/${sharedDocId}/permissions`, {
        cookies: testCtx.owner.cookies,
        body: { user_id: testCtx.viewer.user.id, access_level: 'read' },
      });
      expect(res.status).toBe(201);
    });

    it('should allow viewer to read after grant', async () => {
      const res = await apiCall('GET', `/api/documents/${sharedDocId}`, { cookies: testCtx.viewer.cookies });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.document.title).toBe('Shared Doc');
    });

    it('should block viewer with read-only from editing metadata', async () => {
      const res = await apiCall('PATCH', `/api/documents/${sharedDocId}/metadata`, {
        cookies: testCtx.viewer.cookies,
        body: { title: 'Changed by Viewer' },
      });
      expect([403, 404]).toContain(res.status);
    });

    it('should allow owner to revoke access', async () => {
      const res = await apiCall('DELETE', `/api/permissions/${sharedDocId}/${testCtx.viewer.user.id}`, {
        cookies: testCtx.owner.cookies,
      });
      expect(res.status).toBe(200);
    });

    it('should block viewer after revocation', async () => {
      const res = await apiCall('GET', `/api/documents/${sharedDocId}`, { cookies: testCtx.viewer.cookies });
      expect([403, 404]).toContain(res.status);
    });

    it('should block download after revocation', async () => {
      const res = await apiCall('GET', `/api/documents/${sharedDocId}/download`, { cookies: testCtx.viewer.cookies });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('Edit Permission', () => {
    let editDocId: string;

    beforeAll(async () => {
      const upload = await uploadTestDocument(testCtx.owner, 'Edit Test Doc');
      editDocId = upload.data.document.id;

      await apiCall('POST', `/api/documents/${editDocId}/permissions`, {
        cookies: testCtx.owner.cookies,
        body: { user_id: testCtx.viewer.user.id, access_level: 'edit' },
      });
    });

    it('should allow viewer with edit access to update metadata', async () => {
      const res = await apiCall('PATCH', `/api/documents/${editDocId}/metadata`, {
        cookies: testCtx.viewer.cookies,
        body: { title: 'Edited by Viewer' },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Role Escalation Prevention', () => {
    it('should block viewer from accessing admin stats', async () => {
      const res = await apiCall('GET', '/api/admin/stats', { cookies: testCtx.viewer.cookies });
      expect([403, 401]).toContain(res.status);
    });

    it('should block viewer from accessing admin users', async () => {
      const res = await apiCall('GET', '/api/admin/users', { cookies: testCtx.viewer.cookies });
      expect([403, 401]).toContain(res.status);
    });

    it('should block viewer from changing roles via admin API', async () => {
      const res = await apiCall('PATCH', '/api/admin/users', {
        cookies: testCtx.viewer.cookies,
        body: { user_id: testCtx.viewer.user.id, role: 'admin' },
      });
      expect([403, 401]).toContain(res.status);
    });
  });

  describe('Audit Trail', () => {
    it('should generate audit events for successful operations', async () => {
      const res = await apiCall('GET', '/api/audit', { cookies: testCtx.owner.cookies });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.events).toBeTruthy();
      expect(json.events.length).toBeGreaterThan(0);
    });

    it('should record denied access attempts', async () => {
      const upload = await uploadTestDocument(testCtx.owner, 'Audit Denied Test');
      const docId = upload.data.document.id;

      await apiCall('GET', `/api/documents/${docId}`, { cookies: testCtx.viewer.cookies });

      const res = await apiCall('GET', '/api/audit?outcome=denied', { cookies: testCtx.owner.cookies });
      const json = await res.json();
      expect(res.status).toBe(200);
      const deniedEvents = json.events || [];
      expect(deniedEvents.some((e: any) => e.outcome === 'denied')).toBe(true);
    });

    it('should verify audit chain integrity', async () => {
      const res = await apiCall('GET', '/api/audit/verify', { cookies: testCtx.owner.cookies });
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.is_valid).toBe(true);
    });

    it('should not allow application to modify audit events via Data API', async () => {
      const anonClient = createClient(supabaseUrl, supabaseAnonKey);
      const { data: session } = await anonClient.auth.signInWithPassword({
        email: testCtx.owner.user.email!,
        password: TEST_PASSWORD,
      });

      const { data: events } = await anonClient
        .from('audit_events')
        .select('id')
        .limit(1);

      if (events && events.length > 0) {
        const { error } = await anonClient
          .from('audit_events')
          .update({ action: 'TAMPERED' })
          .eq('id', events[0].id);

        expect(error).toBeTruthy();
      }
    });
  });

  describe('Upload Validation', () => {
    it('should reject executable files', async () => {
      const file = new File(['MZ'], 'malware.exe', { type: 'application/x-msdownload' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', 'Malware Test');

      const res = await apiCall('POST', '/api/documents', {
        cookies: testCtx.owner.cookies,
        body: formData,
      });
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBeTruthy();
    });

    it('should reject files with mismatched signatures', async () => {
      const file = new File(['NOT A PDF'], 'fake.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', 'Fake PDF');

      const res = await apiCall('POST', '/api/documents', {
        cookies: testCtx.owner.cookies,
        body: formData,
      });
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBeTruthy();
    });
  });

  describe('Suspended Account', () => {
    it('should block suspended users from accessing documents', async () => {
      const email = randomEmail();
      const suspendedUser = await createTestUser(email, TEST_PASSWORD);
      await setUserRole(suspendedUser.id, 'viewer');

      const service = makeServiceClient();
      await service.from('profiles').update({ status: 'suspended' }).eq('id', suspendedUser.id);

      const session = await getTestSession(email, TEST_PASSWORD);

      const res = await apiCall('GET', '/api/documents', { cookies: session.cookies });
      expect([403, 401]).toContain(res.status);

      await service.from('profiles').update({ status: 'active' }).eq('id', suspendedUser.id);
      await deleteTestUser(suspendedUser.id);
    });
  });

  describe('Search Does Not Leak', () => {
    it('should not return documents the user cannot access', async () => {
      const upload = await uploadTestDocument(testCtx.owner, 'Exclusive Search Test');
      const docId = upload.data.document.id;

      const res = await apiCall('GET', '/api/documents?search=Exclusive', {
        cookies: testCtx.viewer.cookies,
      });
      const json = await res.json();
      expect(res.status).toBe(200);
      const docs = json.documents || [];
      expect(docs.some((d: any) => d.id === docId)).toBe(false);
    });
  });
});
