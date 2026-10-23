import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthError } from '@/lib/auth';
import { listDocuments, uploadDocument } from '@/lib/document-service';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const result = await listDocuments({
      search: searchParams.get('search') || undefined,
      category: searchParams.get('category') || undefined,
      page: parseInt(searchParams.get('page') || '1'),
      pageSize: parseInt(searchParams.get('pageSize') || '20'),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string;
    const description = (formData.get('description') as string) || '';
    const category = (formData.get('category') as string) || 'general';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const { document, error } = await uploadDocument(file, { title, description, category });
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
