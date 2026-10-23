'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, User, Mail, Calendar } from 'lucide-react';

export default function ProfilePage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  if (loading || !user || !profile) return null;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Profile & Session</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your account information and session details</p>
      </div>

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                {profile.display_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-semibold">{profile.display_name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Role</p>
                  <Badge variant="secondary">{profile.role}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <User className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={profile.status === 'active' ? 'default' : 'destructive'}>{profile.status}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Mail className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border p-3">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Member Since</p>
                  <p className="text-sm font-medium">{new Date(profile.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Session Status</span>
                <Badge variant="default">Active</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">User ID</span>
                <code className="text-xs bg-muted px-2 py-1 rounded">{user.id.slice(0, 8)}...</code>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
