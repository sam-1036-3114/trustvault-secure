import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { signInSchema } from '@/lib/validation';
import { logAuditEvent } from '@/lib/audit';
import { headers } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = signInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    const correlationId = headers().get('x-request-id') || '';

    if (error) {
      await logAuditEvent({
        actor_id: null,
        action: 'login_failed',
        outcome: 'denied',
        request_id: correlationId,
        metadata: { email: parsed.data.email, reason: error.message },
      });
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    await logAuditEvent({
      actor_id: data.user?.id || null,
      action: 'login_success',
      outcome: 'success',
      request_id: correlationId,
      metadata: {},
    });

    return NextResponse.json({ user: data.user, message: 'Signed in successfully' });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
