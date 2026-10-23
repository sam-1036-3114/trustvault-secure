import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthError } from '@/lib/auth';
import { searchUsers } from '@/lib/document-service';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    if (query.length < 2) {
      return NextResponse.json({ users: [] });
    }
    const users = await searchUsers(query);
    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
