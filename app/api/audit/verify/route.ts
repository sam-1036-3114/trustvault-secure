import { NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthError } from '@/lib/auth';
import { verifyAuditIntegrity } from '@/lib/audit';

export async function GET() {
  try {
    await requireAuthenticatedUser();
    const result = await verifyAuditIntegrity();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
