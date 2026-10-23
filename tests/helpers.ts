import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function makeAnonClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

export function makeServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function createTestUser(email: string, password: string) {
  const service = makeServiceClient();
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`Failed to create test user ${email}: ${error.message}`);
  return data.user;
}

export async function deleteTestUser(userId: string) {
  const service = makeServiceClient();
  await service.auth.admin.deleteUser(userId);
}

export async function setUserRole(userId: string, role: string) {
  const service = makeServiceClient();
  const { error } = await service.from('profiles').update({ role }).eq('id', userId);
  if (error) throw new Error(`Failed to set role: ${error.message}`);
}

export async function getTestSession(email: string, password: string) {
  const client = makeAnonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Failed to sign in as ${email}: ${error.message}`);
  return {
    session: data.session!,
    cookies: `sb-access-token=${data.session!.access_token}; sb-refresh-token=${data.session!.refresh_token}`,
  };
}

export async function apiCall(
  method: string,
  path: string,
  options: { cookies?: string; body?: any; headers?: Record<string, string> } = {}
) {
  const baseUrl = `http://localhost:3000`;
  const headers: Record<string, string> = {
    ...options.headers,
  };
  if (options.cookies) {
    headers['Cookie'] = options.cookies;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
  });

  return {
    status: res.status,
    json: async () => {
      try { return await res.json(); } catch { return null; }
    },
    headers: res.headers,
  };
}

export function randomEmail() {
  return `test-${Math.random().toString(36).substring(2, 10)}@trustvault.test`;
}

export const TEST_PASSWORD = 'TestPass123!';

export async function setupTestUsers() {
  const ownerEmail = randomEmail();
  const viewerEmail = randomEmail();
  const otherEmail = randomEmail();

  const owner = await createTestUser(ownerEmail, TEST_PASSWORD);
  const viewer = await createTestUser(viewerEmail, TEST_PASSWORD);
  const other = await createTestUser(otherEmail, TEST_PASSWORD);

  await setUserRole(owner.id, 'owner');
  await setUserRole(viewer.id, 'viewer');
  await setUserRole(other.id, 'owner');

  const ownerSession = await getTestSession(ownerEmail, TEST_PASSWORD);
  const viewerSession = await getTestSession(viewerEmail, TEST_PASSWORD);
  const otherSession = await getTestSession(otherEmail, TEST_PASSWORD);

  return {
    owner: { user: owner, ...ownerSession },
    viewer: { user: viewer, ...viewerSession },
    other: { user: other, ...otherSession },
    cleanup: async () => {
      await deleteTestUser(owner.id);
      await deleteTestUser(viewer.id);
      await deleteTestUser(other.id);
    },
  };
}

export async function uploadTestDocument(session: { cookies: string }, title: string = 'Test Document') {
  const fileContent = new File(['This is test document content'], 'test.txt', { type: 'text/plain' });
  const formData = new FormData();
  formData.append('file', fileContent);
  formData.append('title', title);
  formData.append('category', 'general');

  const res = await apiCall('POST', '/api/documents', { cookies: session.cookies, body: formData });
  const json = await res.json();
  return { status: res.status, data: json };
}
