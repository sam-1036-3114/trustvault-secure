export function safeAuthRedirect(path: string | null): string {
  return path === '/reset-password' ? path : '/dashboard';
}
