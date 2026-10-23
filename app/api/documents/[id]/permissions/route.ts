import { NextRequest, NextResponse } from 'next/server';
import { grantPermission, getDocumentPermissions } from '@/lib/document-service';
import { AuthError } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const result = await getDocumentPermissions(params.id);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }
    return NextResponse.json({ permissions: result.permissions });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json();
    const { error } = await grantPermission(
      params.id,
      body.user_id,
      body.access_level,
    );
    if (error) {
      return NextResponse.json({ error }, { status: error.includes('owner') ? 403 : 400 });
    }
    return NextResponse.json({ message: 'Permission granted' }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
