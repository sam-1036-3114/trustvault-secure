'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/fetch-json';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Users, Shield, UserCog } from 'lucide-react';
import type { Profile } from '@/lib/types';

export default function AdminUsersPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (!loading && user && profile?.role !== 'admin') router.push('/dashboard');
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      fetch('/api/admin/users', { signal: AbortSignal.timeout(12000) })
        .then(async r => { if (!r.ok) throw new Error('Unable to load data. Please retry.'); return r.json(); })
        .then(data => { setUsers(data.users || []); setDataLoading(false); })
        .catch(() => { setLoadError('Unable to load data. Please retry.'); setDataLoading(false); });
    }
  }, [user, profile]);

  const handleUpdateUser = async (userId: string, field: 'role' | 'status', value: string) => {
    try {
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, [field]: value }),
    });
    const data = await res.json();
    if (data.error) {
      toast({ title: 'Update Failed', description: data.error, variant: 'destructive' });
    } else {
      toast({ title: 'User Updated' });
      setUsers(users.map(u => u.id === userId ? data.user : u));
    }
    } catch { toast({ title: 'Request failed', description: 'Unable to connect. Please retry.', variant: 'destructive' }); }
  };

  if (loading || !user || !profile) return null;
  if (profile.role !== 'admin') return null;

  return (
    <AppShell>
      {loadError && <p role="alert" className="mb-4 rounded border p-4">{loadError} <button className="text-primary underline" onClick={() => window.location.reload()}>Retry</button></p>}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UserCog className="h-6 w-6" />
          User Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Admins manage users and security. Owners upload and manage their documents. Viewers read and download shared documents.</p>
      </div>

      {dataLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium hidden md:table-cell">Email</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Role</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-left text-sm font-medium hidden sm:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {u.display_name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{u.display_name}</span>
                      {u.id === user.id && <Badge variant="secondary" className="text-xs">You</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.id === user.id ? (
                      <Badge variant="secondary">{u.role}</Badge>
                    ) : (
                      <Select value={u.role} onValueChange={(v) => handleUpdateUser(u.id, 'role', v)}>
                        <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.id === user.id ? (
                      <Badge variant={u.status === 'active' ? 'default' : 'destructive'}>{u.status}</Badge>
                    ) : (
                      <Select value={u.status} onValueChange={(v) => handleUpdateUser(u.id, 'status', v)}>
                        <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
