import { createServiceClient } from '@/lib/supabase-server';
import type { AuditOutcome } from '@/lib/types';

interface AuditParams {
  actor_id?: string | null;
  action: string;
  document_id?: string | null;
  target_user_id?: string | null;
  outcome?: AuditOutcome;
  request_id?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(params: AuditParams): Promise<string | null> {
  try {
    const serviceClient = createServiceClient();
    const { data, error } = await serviceClient.rpc('insert_audit_event', {
      p_actor_id: params.actor_id ?? null,
      p_action: params.action,
      p_document_id: params.document_id ?? null,
      p_target_user_id: params.target_user_id ?? null,
      p_outcome: params.outcome ?? 'success',
      p_request_id: params.request_id ?? '',
      p_metadata: params.metadata ?? {},
      p_chain_id: 'main',
    });

    if (error) throw new Error('Audit event could not be recorded');
    return data as string;
  } catch {
    // Never log raw SDK errors: request details can contain credentials or metadata.
    throw new Error('Audit service unavailable');
  }
}

export async function verifyAuditIntegrity() {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient.rpc('verify_audit_chain', {
    p_chain_id: 'main',
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) throw new Error('Audit verification unavailable');
  return result;
}
