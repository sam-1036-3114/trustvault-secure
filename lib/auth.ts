import { createClient, createServiceClient } from '@/lib/supabase-server';
import type { AuthUser, UserRole, DocumentOperation, Document, Profile } from '@/lib/types';
import { logAuditEvent } from '@/lib/audit';
import { headers } from 'next/headers';

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function getRequestCorrelationId(): string {
  try {
    const h = headers();
    return h.get('x-request-id') || h.get('x-correlation-id') || '';
  } catch {
    return '';
  }
}

export async function getSessionUser(): Promise<AuthUser | null> {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  let { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (!profileError && !profile) {
    const recovery = await supabase.rpc('ensure_current_profile').maybeSingle();
    profile = recovery.data;
    profileError = recovery.error;
  }
  if (profileError || !profile) return null;

  return {
    id: user.id,
    email: user.email || profile.email,
    profile: profile as Profile,
  };
}

export async function requireAuthenticatedUser(): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new AuthError('UNAUTHENTICATED', 'Authentication required');
  }
  if (user.profile.status !== 'active') {
    throw new AuthError('SUSPENDED', 'Account suspended');
  }
  return user;
}

export async function requireDocumentWriter(): Promise<AuthUser> {
  const user = await requireAuthenticatedUser();
  if (user.profile.role !== 'owner' && user.profile.role !== 'admin') {
    await logAuditEvent({ actor_id: user.id, action: 'document_write_denied', outcome: 'denied' });
    throw new AuthError('FORBIDDEN', 'Owner or administrator access required');
  }
  return user;
}

export async function requireAdministrator(): Promise<AuthUser> {
  const user = await requireAuthenticatedUser();
  if (user.profile.role !== 'admin') {
    await logAuditEvent({
      actor_id: user.id,
      action: 'admin_access_denied',
      outcome: 'denied',
      request_id: getRequestCorrelationId(),
      metadata: { attempted_role: 'admin' },
    });
    throw new AuthError('FORBIDDEN', 'Administrator access required');
  }
  return user;
}

export async function canReadDocument(user: AuthUser, document: Document): Promise<boolean> {
  if (user.profile.status !== 'active' || document.status === 'deleted') return false;
  if (document.owner_id === user.id && user.profile.role !== 'viewer') return true;

  const serviceClient = createServiceClient();
  const { data } = await serviceClient
    .from('document_permissions')
    .select('granted')
    .eq('document_id', document.id)
    .eq('user_id', user.id)
    .eq('granted', true)
    .maybeSingle();

  return !!data;
}

export async function canEditDocument(user: AuthUser, document: Document): Promise<boolean> {
  if (user.profile.role === 'viewer') return false;
  if (user.profile.status !== 'active' || document.status === 'deleted') return false;
  if (document.owner_id === user.id) return true;

  const serviceClient = createServiceClient();
  const { data } = await serviceClient
    .from('document_permissions')
    .select('access_level, granted')
    .eq('document_id', document.id)
    .eq('user_id', user.id)
    .eq('granted', true)
    .maybeSingle();

  return data?.access_level === 'edit';
}

export async function canManageDocumentAccess(user: AuthUser, document: Document): Promise<boolean> {
  return user.profile.status === 'active' && user.profile.role !== 'viewer' && document.status !== 'deleted' && document.owner_id === user.id;
}

export async function authoriseDocumentOperation(
  user: AuthUser,
  document: Document,
  operation: DocumentOperation,
): Promise<void> {
  const correlationId = getRequestCorrelationId();

  const writeOperations: DocumentOperation[] = ['edit', 'delete', 'manage_access', 'upload'];
  if (writeOperations.includes(operation) && user.profile.role === 'viewer') {
    throw new AuthError('FORBIDDEN', 'Viewer accounts have read-only access');
  }
  let allowed = false;
  switch (operation) {
    case 'read':
    case 'preview':
    case 'download':
      allowed = await canReadDocument(user, document);
      break;
    case 'edit':
      allowed = await canEditDocument(user, document);
      break;
    case 'delete':
    case 'manage_access':
      allowed = await canManageDocumentAccess(user, document);
      break;
    case 'upload':
      allowed = true;
      break;
  }

  if (!allowed) {
    await logAuditEvent({
      actor_id: user.id,
      action: `document_${operation}_denied`,
      document_id: document.id,
      outcome: 'denied',
      request_id: correlationId,
      metadata: { operation, document_title: document.title },
    });
    throw new AuthError('FORBIDDEN', `Not authorised to ${operation} this document`);
  }

  await logAuditEvent({
    actor_id: user.id,
    action: `document_${operation}`,
    document_id: document.id,
    outcome: 'success',
    request_id: correlationId,
    metadata: { operation },
  });
}

export async function getDocumentForAuthorisedCheck(
  documentId: string,
): Promise<Document | null> {
  const serviceClient = createServiceClient();
  const { data } = await serviceClient
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .maybeSingle();
  return data as Document | null;
}
