import { NextResponse } from 'next/server';
import { requireAdministrator, AuthError } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase-server';
import { verifyAuditIntegrity } from '@/lib/audit';

export async function GET() {
  try {
    await requireAdministrator();
    const serviceClient = createServiceClient();

    const [docsResult, usersResult, deniedResult, permChangesResult, alertsResult, auditVerification] =
      await Promise.all([
        serviceClient.from('documents').select('*', { count: 'exact', head: true }).neq('status', 'deleted'),
        serviceClient.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        serviceClient.from('audit_events').select('*', { count: 'exact', head: true }).eq('outcome', 'denied'),
        serviceClient.from('audit_events').select('*', { count: 'exact', head: true }).in('action', ['permission_granted', 'permission_revoked']),
        serviceClient.from('security_alerts').select('*', { count: 'exact', head: true }).eq('acknowledged', false),
        verifyAuditIntegrity(),
      ]);

    for (const result of [docsResult, usersResult, deniedResult, permChangesResult, alertsResult]) { if (result.error) throw result.error; }

    const { data: recentUploads, error: uploadsError } = await serviceClient
      .from('audit_events')
      .select('*')
      .eq('action', 'document_upload')
      .order('event_timestamp', { ascending: false })
      .limit(5);

    const { data: recentDenied, error: deniedError } = await serviceClient
      .from('audit_events')
      .select('*')
      .eq('outcome', 'denied')
      .order('event_timestamp', { ascending: false })
      .limit(10);

    if (uploadsError || deniedError) throw new Error('Security data unavailable');
    return NextResponse.json({
      totalDocuments: docsResult.count || 0,
      activeUsers: usersResult.count || 0,
      deniedAttempts: deniedResult.count || 0,
      permissionChanges: permChangesResult.count || 0,
      unacknowledgedAlerts: alertsResult.count || 0,
      recentUploads: recentUploads || [],
      recentDenied: recentDenied || [],
      auditIntegrity: auditVerification,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
