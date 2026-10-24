'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Shield, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  const { signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode as 'signin' | 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
    if (mode === 'signup') {
      const { error, needsConfirmation } = await signUp(email, password, displayName);
      if (error) {
        toast({ title: 'Sign Up Failed', description: error, variant: 'destructive' });
        setLoading(false);
        return;
      }
      if (needsConfirmation) {
        toast({ title: 'Check your email', description: 'Confirm your account, then sign in to open your dashboard.' });
        setMode('signin');
        setLoading(false);
        return;
      }
      toast({ title: 'Account Created', description: 'Welcome to TrustVault' });
      router.push('/dashboard');
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: 'Sign In Failed', description: error, variant: 'destructive' });
        setLoading(false);
        return;
      }
      router.push('/dashboard');
    }
    } catch {
      toast({ title: 'Connection failed', description: 'Please try again.', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <Shield className="h-8 w-8 text-primary" />
        <span className="text-2xl font-bold">TrustVault</span>
      </Link>

      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === 'signin' ? 'Sign In' : 'Create Account'}</CardTitle>
        </CardHeader>
        <CardContent>
          {searchParams.get('error') === 'confirmation' && <p role="alert" className="mb-4 text-sm text-destructive">This confirmation link is invalid or expired. Please request a new link.</p>}
          {searchParams.get('reset') === 'success' && <p role="status" className="mb-4 text-sm">Password updated. Sign in with your new password.</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  minLength={1}
                  placeholder="Jane Doe"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="At least 8 characters"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          <Link href="/forgot-password" className="mt-4 block text-center text-sm text-primary underline">Forgot your password?</Link>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'signin' ? (
              <>
                Don&apos;t have an account?{' '}
                <button onClick={() => setMode('signup')} className="font-medium text-primary hover:underline">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => setMode('signin')} className="font-medium text-primary hover:underline">
                  Sign in
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
