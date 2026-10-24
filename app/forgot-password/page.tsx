'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const { error } = await getBrowserClient().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      setMessage(error ? 'Unable to send a recovery email. Please try again.' : 'If an account exists, check your email for a password reset link.');
    } catch { setMessage('Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
    <h1 className="text-2xl font-bold">Reset your password</h1>
    <form onSubmit={submit} className="space-y-4">
      <Label htmlFor="email">Email address</Label><Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <Button disabled={busy} type="submit">{busy ? 'Sending…' : 'Send recovery email'}</Button>
    </form><p role="status">{message}</p><Link href="/login" className="text-primary underline">Return to sign in</Link>
  </main>;
}
