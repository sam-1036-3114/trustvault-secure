'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase-browser';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      if (password !== confirmation) { setMessage('Passwords must match.'); return; }
      const client = getBrowserClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user) { setMessage('Your recovery link has expired. Request a new recovery email.'); return; }
      const { error } = await client.auth.updateUser({ password });
      if (error) { setMessage('Unable to update your password. Request a new recovery email and try again.'); return; }
      await client.auth.signOut();
      window.location.href = '/login?reset=success';
    } catch { setMessage('Unable to connect. Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
    <h1 className="text-2xl font-bold">Choose a new password</h1>
    <form onSubmit={submit} className="space-y-4">
      <Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} />
      <Label htmlFor="confirmation">Confirm password</Label><Input id="confirmation" type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={e => setConfirmation(e.target.value)} />
      <Button disabled={busy} type="submit">{busy ? 'Saving…' : 'Save password'}</Button>
    </form><p role="status">{message}</p><Link href="/forgot-password" className="text-primary underline">Request a new recovery link</Link>
  </main>;
}
