import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { logAuditEvent } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';

export async function POST() {
  try {
    const user = await getSessionUser();
    const supabase = createClient();
    await supabase.auth.signOut();

    if (user) {
      await logAuditEvent({
        actor_id: user.id,
        action: 'logout',
        outcome: 'success',
        metadata: {},
      });
    }

    return NextResponse.json({ message: 'Signed out successfully' });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
