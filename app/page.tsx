'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { Shield, Lock, FileText, Eye, Activity, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function LandingPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (user && profile) {
    router.push('/dashboard');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            <span className="text-xl font-bold">TrustVault</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/login?mode=signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
          <div className="relative mx-auto max-w-7xl px-6 py-24 lg:py-32">
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="secondary" className="mb-4">
                <Lock className="mr-1 h-3 w-3" />
                Enterprise-grade security
              </Badge>
              <h1 className="text-4xl font-bold tracking-tight lg:text-6xl">
                Secure document sharing with a{' '}
                <span className="text-primary">tamper-evident audit trail</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
                Upload, share, and audit confidential documents with per-document
                permissions, immediate revocation, and cryptographic proof of every action.
              </p>
              <div className="mt-8 flex items-center justify-center gap-4">
                <Link href="/login">
                  <Button size="lg" className="gap-2">
                    Sign In
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/login?mode=signup">
                  <Button size="lg" variant="outline">Create Account</Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="mt-4">Per-Document Permissions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Grant read or edit access to specific users for each document.
                  Permissions are checked server-side on every request — no exceptions.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="mt-4">Immediate Revocation</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Revoke access and the next request is blocked instantly.
                  No long-lived signed URLs, no cached authorisation decisions.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="mt-4">Tamper-Evident Audit</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Every action is logged in a SHA-256 hash chain that detects
                  modification, deletion, or reordering of audit events.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-t bg-card/50">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <h2 className="text-center text-2xl font-bold">Three roles, clearly enforced</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                { icon: Shield, title: 'Administrator', desc: 'Manage users, monitor security, investigate incidents' },
                { icon: FileText, title: 'Document Owner', desc: 'Upload, share, revoke, and audit owned documents' },
                { icon: Eye, title: 'Viewer', desc: 'Read and download only authorised documents' },
              ].map((role) => {
                const Icon = role.icon;
                return (
                  <div key={role.title} className="flex flex-col items-center rounded-lg border p-6 text-center">
                    <Icon className="h-8 w-8 text-primary" />
                    <h3 className="mt-3 font-semibold">{role.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{role.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="text-center text-2xl font-bold">Security guarantees</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {[
              'Server-side authorisation on every protected operation',
              'No IDOR — document IDs cannot be guessed or swapped',
              'Private storage with opaque server-generated keys',
              'Upload validation: file type, signature, size, executable rejection',
              'Append-only audit log — application cannot modify or delete events',
              'Hash-chain integrity verification detects tampering',
              'Suspended accounts are blocked immediately',
              'Role escalation is impossible through the application',
            ].map((item) => (
              <div key={item} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t py-8 text-center text-sm text-muted-foreground">
          <p>TrustVault — Secure Document Sharing for the Snovasys Fresher Hiring Challenge 2026</p>
        </footer>
      </main>
    </div>
  );
}
