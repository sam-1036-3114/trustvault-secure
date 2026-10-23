import { NextRequest, NextResponse } from 'next/server';
import { revokePermission } from '@/lib/document-service';
import { AuthError } from '@/lib/auth';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { documentId: string; userId: string } },
) {
  try {
    const { error } = await revokePermission(params.documentId, params.userId);
    if (error) {
      return NextResponse.json({ error }, { status: error.includes('owner') ? 403 : 400 });
    }
    return NextResponse.json({ message: 'Permission revoked' });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
