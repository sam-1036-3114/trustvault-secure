'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJson } from '@/lib/fetch-json';
import { useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/sidebar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Upload, Search, Download, Trash2, Edit, Loader2, File } from 'lucide-react';
import type { Document } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { ALLOWED_FILE_TYPES } from '@/lib/validation';
import Link from 'next/link';

type DocWithMeta = Document & { owner_email?: string; owner_name?: string; access_level?: string };

export default function DocumentsPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<DocWithMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [dataLoading, setDataLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('general');
  const [uploadDescription, setUploadDescription] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  const fetchDocs = useCallback(async (signal?: AbortSignal) => {
    if (!user) return;
    setDataLoading(true); setLoadError('');
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (search) params.set('search', search);
    if (category !== 'all') params.set('category', category);
    try {
      const data = await fetchJson(`/api/documents?${params}`, { signal });
      if (signal?.aborted) return;
      setDocuments(data.documents); setTotal(data.total);
    } catch (error) {
      if (!signal?.aborted) setLoadError(error instanceof Error ? error.message : 'Unable to load documents.');
    } finally { if (!signal?.aborted) setDataLoading(false); }
  }, [user, search, category, page]);

  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(() => { void fetchDocs(controller.signal); }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [fetchDocs]);

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', uploadTitle);
    formData.append('category', uploadCategory);
    formData.append('description', uploadDescription);

    try {
    const res = await fetch('/api/documents', { method: 'POST', body: formData, signal: AbortSignal.timeout(20000) });
    const data = await res.json();
    setUploading(false);

    if (data.error) {
      toast({ title: 'Upload Failed', description: data.error, variant: 'destructive' });
    } else {
      toast({ title: 'Document Uploaded', description: `${uploadTitle} uploaded successfully` });
      setUploadOpen(false);
      setUploadFile(null);
      setUploadTitle('');
      setUploadDescription('');
      fetchDocs();
    }
    } catch { toast({ title: 'Upload failed', description: 'Unable to upload. Please retry.', variant: 'destructive' }); }
    finally { setUploading(false); }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) {
      toast({ title: 'Delete Failed', description: data.error, variant: 'destructive' });
    } else {
      toast({ title: 'Document Deleted', description: `${title} has been deleted` });
      fetchDocs();
    }
    } catch { toast({ title: 'Request failed', description: 'Unable to connect. Please retry.', variant: 'destructive' }); }
  };

  const handleDownload = async (id: string) => {
    window.location.href = `/api/documents/${id}/download`;
  };

  if (loading || !user || !profile) return null;

  const categories = ['all', 'general', 'legal', 'financial', 'hr', 'technical', 'confidential'];

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">{total} document{total !== 1 ? 's' : ''}</p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild disabled={profile.role === 'viewer'}>
            <Button className="gap-2" disabled={profile.role === 'viewer'}>
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Document</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Document title" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">File (max 10MB, allowed: {ALLOWED_FILE_TYPES.join(', ')})</Label>
                <Input
                  id="file"
                  type="file"
                  accept={ALLOWED_FILE_TYPES.map(t => `.${t}`).join(',')}
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => c !== 'all').map(c => (
                      <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Input id="description" value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} placeholder="Brief description" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadTitle}>
                {uploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Upload
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={value => { setCategory(value); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {categories.map(c => (
              <SelectItem key={c} value={c} className="capitalize">{c === 'all' ? 'All Categories' : c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border">
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('list')}>List</Button>
          <Button variant={view === 'grid' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('grid')}>Grid</Button>
        </div>
      </div>

      {loadError && <p role="alert" className="mb-4 rounded border p-4">{loadError} <button className="text-primary underline" onClick={() => { void fetchDocs(); }}>Retry</button></p>}
      {dataLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />)}
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <File className="h-12 w-12 text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">No documents found</p>
            <p className="text-xs text-muted-foreground">Upload a document or adjust your search</p>
          </CardContent>
        </Card>
      ) : view === 'list' ? (
        <div className="rounded-md border">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Title</th>
                <th className="px-4 py-3 text-left text-sm font-medium hidden md:table-cell">Category</th>
                <th className="px-4 py-3 text-left text-sm font-medium hidden lg:table-cell">Owner</th>
                <th className="px-4 py-3 text-left text-sm font-medium hidden sm:table-cell">Size</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Access</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {documents.map((doc) => (
                <tr key={doc.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/documents/${doc.id}`} className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium hover:underline">{doc.title}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <Badge variant="outline" className="capitalize">{doc.category}</Badge>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">
                    {doc.access_level === 'owner' ? 'You' : doc.owner_name || doc.owner_email}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-sm text-muted-foreground">
                    {(doc.file_size / 1024).toFixed(1)} KB
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={doc.access_level === 'owner' ? 'default' : doc.access_level === 'edit' ? 'secondary' : 'outline'}>
                      {doc.access_level || 'read'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleDownload(doc.id)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {profile.role !== 'viewer' && doc.access_level === 'owner' && (
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(doc.id, doc.title)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant={doc.access_level === 'owner' ? 'default' : 'outline'}>
                    {doc.access_level || 'read'}
                  </Badge>
                </div>
                <Link href={`/documents/${doc.id}`}>
                  <h3 className="mt-3 font-medium hover:underline">{doc.title}</h3>
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {doc.category} - {(doc.file_size / 1024).toFixed(1)} KB
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleDownload(doc.id)}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {profile.role !== 'viewer' && doc.access_level === 'owner' && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(doc.id, doc.title)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {total > 20 && <div className="mt-6 flex items-center justify-center gap-4">
        <Button variant="outline" disabled={page === 1 || dataLoading} onClick={() => setPage(p => p - 1)}>Previous</Button>
        <span>Page {page} of {Math.ceil(total / 20)}</span>
        <Button variant="outline" disabled={page * 20 >= total || dataLoading} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>}
    </AppShell>
  );
}
