import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdministrator, AuthError } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { logAuditEvent } from '@/lib/audit';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '@/lib/validation';

const settingsSchema = z.object({
  org_name: z.string().trim().min(1).max(100),
  max_file_size_bytes: z.number().int().min(1024).max(MAX_FILE_SIZE),
  allowed_file_types: z.array(z.string().refine(value => ALLOWED_FILE_TYPES.includes(value))).min(1).max(ALLOWED_FILE_TYPES.length),
}).strict();

export async function GET() {
  try {
    await requireAdministrator();
    const { data, error } = await createServiceClient().from('organisation_settings').select('*').eq('id', 1).single();
    if (error) throw error;
    return NextResponse.json({ settings: data });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdministrator();
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: 'Invalid security settings' }, { status: 400 });
    const { data, error } = await createServiceClient().from('organisation_settings').update(parsed.data).eq('id', 1).select('*').single();
    if (error) throw error;
    await logAuditEvent({ actor_id: admin.id, action: 'admin_settings_updated', outcome: 'success', metadata: parsed.data });
    return NextResponse.json({ settings: data });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 });
  return NextResponse.json({ error: 'Unable to load or save security settings' }, { status: 503 });
}
