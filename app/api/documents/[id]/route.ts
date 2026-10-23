import { NextRequest, NextResponse } from 'next/server';
import { getDocumentDetail, deleteDocument } from '@/lib/document-service';
import { AuthError } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const result = await getDocumentDetail(params.id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.error === 'Access denied' ? 403 : 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { error } = await deleteDocument(params.id);
    if (error) {
      return NextResponse.json({ error }, { status: error.includes('owner') ? 403 : 404 });
    }
    return NextResponse.json({ message: 'Document deleted' });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
