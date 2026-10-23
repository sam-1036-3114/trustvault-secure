import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <FileQuestion className="h-16 w-16 text-muted-foreground" />
      <h1 className="mt-6 text-2xl font-bold">Page Not Found</h1>
      <p className="mt-2 text-muted-foreground">The page you are looking for does not exist.</p>
      <Link href="/" className="mt-6">
        <Button>Go Home</Button>
      </Link>
    </div>
  );
}
