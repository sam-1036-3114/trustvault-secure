'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/fetch-json';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ALLOWED_FILE_TYPES } from '@/lib/validation';
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
  const [loadError, setLoadError] = useState('');
  const [settings, setSettings] = useState<{ org_name: string; max_file_size_bytes: number; allowed_file_types: string[] } | null>(null);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && profile?.role !== 'admin') router.push('/dashboard');
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      fetchJson('/api/admin/settings').then(data => setSettings(data.settings)).catch(() => setSettingsMessage('Unable to load settings. Please retry.'));
      fetch('/api/admin/stats', { signal: AbortSignal.timeout(12000) })
        .then(async r => { if (!r.ok) throw new Error('Unable to load data. Please retry.'); return r.json(); })
        .then(data => { setStats(data); setDataLoading(false); })
        .catch(() => { setLoadError('Unable to load data. Please retry.'); setDataLoading(false); });
    }
  }, [user, profile]);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setSettingsMessage('');
    try {
      const data = await fetchJson('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings && { org_name: settings.org_name, max_file_size_bytes: settings.max_file_size_bytes, allowed_file_types: settings.allowed_file_types }) });
      setSettings(data.settings); setSettingsMessage('Security settings saved.');
    } catch (error) { setSettingsMessage(error instanceof Error ? error.message : 'Unable to save settings.'); }
    finally { setSaving(false); }
  }

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
      {loadError && <p role="alert" className="mb-4 rounded border p-4">{loadError} <button className="text-primary underline" onClick={() => window.location.reload()}>Retry</button></p>}
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
                    {!stats?.auditIntegrity ? 'Unavailable' : stats.auditIntegrity.is_valid ? 'Valid' : 'Tampered'}
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
      <Card className="mt-6"><CardHeader><CardTitle>Security settings</CardTitle></CardHeader><CardContent>
        <p role="status" className="mb-4 text-sm">{settingsMessage}</p>
        {settings && <form onSubmit={saveSettings} className="max-w-lg space-y-4">
          <div className="space-y-2"><Label htmlFor="org-name">Organisation name</Label><Input id="org-name" required maxLength={100} value={settings.org_name} onChange={event => setSettings({ ...settings, org_name: event.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="max-upload">Maximum upload size (MB, up to 10)</Label><Input id="max-upload" type="number" min="0.01" max="10" step="0.01" required value={settings.max_file_size_bytes / 1048576} onChange={event => setSettings({ ...settings, max_file_size_bytes: Math.round(Number(event.target.value) * 1048576) })} /></div>
          <fieldset><legend className="mb-2 text-sm font-medium">Allowed file types</legend><div className="flex flex-wrap gap-4">{ALLOWED_FILE_TYPES.map(type => <label key={type} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.allowed_file_types.includes(type)} onChange={event => setSettings({ ...settings, allowed_file_types: event.target.checked ? [...settings.allowed_file_types, type] : settings.allowed_file_types.filter(value => value !== type) })} />{type}</label>)}</div></fieldset>
          <Button type="submit" disabled={saving || !settings.allowed_file_types.length}>{saving ? 'Saving…' : 'Save settings'}</Button>
        </form>}
      </CardContent></Card>
    </AppShell>
  );
}
