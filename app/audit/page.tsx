'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, Shield, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import type { AuditEvent } from '@/lib/types';

export default function AuditPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [dataLoading, setDataLoading] = useState(true);
  const [integrity, setIntegrity] = useState<{ is_valid: boolean; total_events: number; verified_events: number } | null>(null);
  const [filterOutcome, setFilterOutcome] = useState<string>('all');

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      setDataLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (filterOutcome !== 'all') params.set('outcome', filterOutcome);
      Promise.all([
        fetch(`/api/audit?${params}`).then(r => r.json()),
        fetch('/api/audit/verify').then(r => r.json()),
      ]).then(([auditData, intData]) => {
        setEvents(auditData.events || []);
        setTotal(auditData.total || 0);
        setIntegrity(intData);
        setDataLoading(false);
      });
    }
  }, [user, page, filterOutcome]);

  if (loading || !user || !profile) return null;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Audit Trail</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tamper-evident log of all security events</p>
      </div>

      <Card className="mb-6">
        <CardContent className="flex items-center gap-4 p-5">
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${integrity?.is_valid ? 'bg-success/10' : 'bg-destructive/10'}`}>
            {integrity?.is_valid ? <CheckCircle2 className="h-6 w-6 text-success" /> : <AlertTriangle className="h-6 w-6 text-destructive" />}
          </div>
          <div className="flex-1">
            <p className="font-medium">Audit Chain Integrity</p>
            <p className="text-sm text-muted-foreground">
              {integrity?.total_events ?? 0} total events, {integrity?.verified_events ?? 0} verified
            </p>
          </div>
          <Badge variant={integrity?.is_valid ? 'default' : 'destructive'}>
            {integrity?.is_valid ? 'Chain Valid' : 'Chain Tampered'}
          </Badge>
        </CardContent>
      </Card>

      <div className="mb-4 flex gap-2">
        {['all', 'success', 'denied', 'error'].map(o => (
          <Button
            key={o}
            variant={filterOutcome === o ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => { setFilterOutcome(o); setPage(1); }}
            className="capitalize"
          >
            {o}
          </Button>
        ))}
      </div>

      {dataLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Activity className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">No audit events found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">#</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Action</th>
                <th className="px-4 py-3 text-left text-sm font-medium hidden md:table-cell">Timestamp</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-sm text-muted-foreground">{event.sequence_number}</td>
                  <td className="px-4 py-3 text-sm font-medium">{event.action.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                    {new Date(event.event_timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={event.outcome === 'denied' ? 'destructive' : event.outcome === 'success' ? 'default' : 'secondary'}>
                      {event.outcome}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 50 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" disabled={events.length < 50} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </AppShell>
  );
}
