import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(changes) {
        changes.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        changes.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getUser verifies and refreshes cookies. Authorization stays in server endpoints.
  try { await client.auth.getUser(); } catch { /* Pages provide retry/sign-in recovery. */ }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: ['/dashboard/:path*', '/documents/:path*', '/admin/:path*', '/audit/:path*', '/profile/:path*', '/api/:path*'],
};
