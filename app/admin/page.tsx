'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, AlertTriangle, CheckCircle2, Activity, FileText, Users } from 'lucide-react';

export default function AdminPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && profile?.role !== 'admin') router.push('/dashboard');
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      fetch('/api/admin/stats')
        .then(r => r.json())
        .then(data => { setStats(data); setDataLoading(false); })
        .catch(() => setDataLoading(false));
    }
  }, [user, profile]);

  if (loading || !user || !profile) return null;
  if (profile.role !== 'admin') return null;

  const cards = [
    { label: 'Total Documents', value: stats?.totalDocuments ?? 0, icon: FileText },
    { label: 'Active Users', value: stats?.activeUsers ?? 0, icon: Users },
    { label: 'Denied Attempts', value: stats?.deniedAttempts ?? 0, icon: AlertTriangle },
    { label: 'Permission Changes', value: stats?.permissionChanges ?? 0, icon: Activity },
  ];

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Security Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">Organisation-wide security monitoring</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Audit Integrity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dataLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Chain Status</span>
                  <Badge variant={stats?.auditIntegrity?.is_valid ? 'default' : 'destructive'}>
                    {stats?.auditIntegrity?.is_valid ? 'Valid' : 'Tampered'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Total Events</span>
                  <span className="font-bold">{stats?.auditIntegrity?.total_events ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Verified Events</span>
                  <span className="font-bold">{stats?.auditIntegrity?.verified_events ?? 0}</span>
                </div>
                {stats?.auditIntegrity?.error_message && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {stats.auditIntegrity.error_message}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Recent Denied Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            {dataLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : stats?.recentDenied?.length ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {stats.recentDenied.map((event: any) => (
                  <div key={event.id} className="flex items-center gap-2 border-b pb-2 last:border-0">
                    <div className="h-2 w-2 rounded-full bg-destructive" />
                    <span className="flex-1 text-sm truncate">{event.action.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-muted-foreground">{new Date(event.event_timestamp).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No denied access attempts</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Uploads</CardTitle>
          </CardHeader>
          <CardContent>
            {dataLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : stats?.recentUploads?.length ? (
              <div className="space-y-2">
                {stats.recentUploads.map((event: any) => (
                  <div key={event.id} className="flex items-center gap-2 border-b pb-2 last:border-0">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="flex-1 text-sm">{event.action.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-muted-foreground">{new Date(event.event_timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No recent uploads</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
