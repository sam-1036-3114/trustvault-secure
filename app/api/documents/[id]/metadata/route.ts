import { NextRequest, NextResponse } from 'next/server';
import { updateDocumentMetadata } from '@/lib/document-service';
import { AuthError } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json();
    const { document, error } = await updateDocumentMetadata(params.id, body);
    if (error) {
      return NextResponse.json({ error }, { status: error === 'Access denied' ? 403 : 400 });
    }
    return NextResponse.json({ document });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
