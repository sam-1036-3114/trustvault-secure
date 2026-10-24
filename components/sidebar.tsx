'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Shield, FileText, LayoutDashboard, Activity, Users, LogOut, Settings, User, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/audit', label: 'Audit Trail', icon: Activity },
];

const adminItems = [
  { href: '/admin', label: 'Security Center', icon: Shield },
  { href: '/admin/users', label: 'User Management', icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();

  if (!profile) return null;

  const items = [...navItems];
  if (profile.role === 'admin') items.push(...adminItems);
  items.push({ href: '/profile', label: 'Profile', icon: User });

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Shield className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">TrustVault</span>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {profile.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{profile.display_name}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.role}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  if (profile?.status === 'suspended') return <div role="alert" className="mx-auto max-w-md space-y-4 p-8"><h1 className="text-xl font-bold">Account suspended</h1><p>Contact your administrator to restore access.</p><button className="text-primary underline" onClick={() => { void signOut().then(() => { window.location.href = '/login'; }); }}>Sign out</button></div>;
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="pl-64">
        <div className="mx-auto max-w-7xl p-6 lg:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export function BackButton({ href = '/dashboard' }: { href?: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" />
      Back
    </Link>
  );
}
