'use client';

import Link from 'next/link';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AccessDeniedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <Shield className="h-8 w-8 text-destructive" />
      </div>
      <h1 className="mt-6 text-2xl font-bold">Access Denied</h1>
      <p className="mt-2 text-center text-muted-foreground">
        You do not have permission to access this resource.
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        If you believe this is an error, contact your administrator.
      </p>
      <Link href="/dashboard" className="mt-6">
        <Button>Return to Dashboard</Button>
      </Link>
    </div>
  );
}
