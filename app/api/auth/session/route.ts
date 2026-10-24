import { NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthError } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';

export async function POST() {
  try {
    const user = await requireAuthenticatedUser();
    await logAuditEvent({ actor_id: user.id, action: 'session_established', outcome: 'success' });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.code === 'UNAUTHENTICATED' ? 401 : 403 });
    return NextResponse.json({ error: 'Unable to verify your account session' }, { status: 503 });
  }
}
