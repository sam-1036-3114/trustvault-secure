import { pagination } from '@/lib/validation';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireAdministrator, AuthError } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const serviceClient = createServiceClient();
    const searchParams = req.nextUrl.searchParams;
    const { page, pageSize } = pagination(searchParams.get('page') ?? undefined, searchParams.get('pageSize') ?? undefined, 50);
    const offset = (page - 1) * pageSize;
    const action = searchParams.get('action');
    const outcome = searchParams.get('outcome');

    let query = serviceClient
      .from('audit_events')
      .select('*', { count: 'exact' })
      .order('sequence_number', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (action) query = query.eq('action', action);
    if (outcome) query = query.eq('outcome', outcome);

    if (user.profile.role !== 'admin') {
      query = query.or(`actor_id.eq.${user.id},target_user_id.eq.${user.id}`);
    }
    const { data, count, error } = await query;
    if (error) throw error;

    const events = (data || []).filter((e: { actor_id: string | null; target_user_id: string | null }) => {
      if (user.profile.role === 'admin') return true;
      if (e.actor_id === user.id) return true;
      if (e.target_user_id === user.id) return true;
      return false;
    });

    return NextResponse.json({ events, total: count || 0 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
