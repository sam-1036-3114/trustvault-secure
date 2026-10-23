'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppShell, BackButton } from '@/components/sidebar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Trash2, Shield, FileText, Users, Activity, Loader2, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Document, Profile, DocumentPermission, DocumentVersion } from '@/lib/types';

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [doc, setDoc] = useState<Document | null>(null);
  const [owner, setOwner] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<(DocumentPermission & { user_email?: string; user_name?: string })[]>([]);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [accessLevel, setAccessLevel] = useState<'read' | 'edit'>('read');

  useEffect(() => {
    if (!loading && !user) router.push('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (user) {
      fetch(`/api/documents/${id}`)
        .then(r => r.json())
        .then(data => {
          if (data.error) {
            setError(data.error);
          } else {
            setDoc(data.document);
            setOwner(data.owner);
            setPermissions(data.permissions || []);
            setVersions(data.versions || []);
            setEditTitle(data.document?.title || '');
            setEditCategory(data.document?.category || 'general');
            setEditDescription(data.document?.description || '');
          }
          setDataLoading(false);
        })
        .catch(() => {
          setError('Failed to load document');
          setDataLoading(false);
        });
    }
  }, [user, id]);

  const isOwner = doc?.owner_id === user?.id;

  const handleDownload = () => {
    window.location.href = `/api/documents/${id}/download`;
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${doc?.title}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) {
      toast({ title: 'Delete Failed', description: data.error, variant: 'destructive' });
    } else {
      toast({ title: 'Document Deleted' });
      router.push('/documents');
    }
  };

  const handleSaveEdit = async () => {
    const res = await fetch(`/api/documents/${id}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, category: editCategory, description: editDescription }),
    });
    const data = await res.json();
    if (data.error) {
      toast({ title: 'Update Failed', description: data.error, variant: 'destructive' });
    } else {
      setDoc(data.document);
      setEditMode(false);
      toast({ title: 'Document Updated' });
    }
  };

  const searchUsers = async (query: string) => {
    setUserSearch(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    setSearchResults(data.users || []);
  };

  const handleGrant = async () => {
    if (!selectedUser) return;
    const res = await fetch(`/api/documents/${id}/permissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: selectedUser, access_level: accessLevel }),
    });
    const data = await res.json();
    if (data.error) {
      toast({ title: 'Grant Failed', description: data.error, variant: 'destructive' });
    } else {
      toast({ title: 'Access Granted', description: `${accessLevel} access granted` });
      setShareOpen(false);
      setSelectedUser('');
      setUserSearch('');
      setSearchResults([]);
      const detailRes = await fetch(`/api/documents/${id}`);
      const detailData = await detailRes.json();
      setPermissions(detailData.permissions || []);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!confirm('Revoke access for this user?')) return;
    const res = await fetch(`/api/permissions/${id}/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.error) {
      toast({ title: 'Revoke Failed', description: data.error, variant: 'destructive' });
    } else {
      toast({ title: 'Access Revoked' });
      setPermissions(permissions.filter(p => p.user_id !== userId));
    }
  };

  if (loading || dataLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <BackButton href="/documents" />
        <Card>
          <CardContent className="flex flex-col items-center py-20">
            <Shield className="h-12 w-12 text-destructive" />
            <p className="mt-4 font-medium">{error}</p>
            <p className="text-sm text-muted-foreground">You may not have permission to view this document</p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  if (!doc) return null;

  return (
    <AppShell>
      <BackButton href="/documents" />

      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            {editMode ? (
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-xl font-bold" />
            ) : (
              <h1 className="text-2xl font-bold">{doc.title}</h1>
            )}
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
              <Badge variant="outline" className="capitalize">{doc.category}</Badge>
              <span>{(doc.file_size / 1024).toFixed(1)} KB</span>
              <span>.{doc.file_type}</span>
              <span>v{doc.version_number}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
          {isOwner && (
            <>
              <Button variant="outline" onClick={() => setEditMode(!editMode)}>
                {editMode ? 'Cancel' : 'Edit'}
              </Button>
              <Dialog open={shareOpen} onOpenChange={setShareOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Share Document</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Search for user</Label>
                      <Input
                        placeholder="Search by name or email..."
                        value={userSearch}
                        onChange={(e) => searchUsers(e.target.value)}
                      />
                      {searchResults.length > 0 && (
                        <div className="rounded-md border max-h-48 overflow-y-auto">
                          {searchResults.map((u) => (
                            <button
                              key={u.id}
                              onClick={() => {
                                setSelectedUser(u.id);
                                setUserSearch(`${u.display_name} (${u.email})`);
                                setSearchResults([]);
                              }}
                              className="flex w-full items-center gap-2 p-2 hover:bg-muted text-left"
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                {u.display_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-medium">{u.display_name}</p>
                                <p className="text-xs text-muted-foreground">{u.email}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Access Level</Label>
                      <Select value={accessLevel} onValueChange={(v) => setAccessLevel(v as 'read' | 'edit')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">Read only — can view and download</SelectItem>
                          <SelectItem value="edit">Edit — can view, download, and edit metadata</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShareOpen(false)}>Cancel</Button>
                    <Button onClick={handleGrant} disabled={!selectedUser}>Grant Access</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="destructive" size="icon" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {editMode && (
        <Card className="mb-6">
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          {isOwner && <TabsTrigger value="permissions">Permissions</TabsTrigger>}
          <TabsTrigger value="versions">Versions</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Owner</p>
                  <p className="font-medium">{owner?.display_name || owner?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">{new Date(doc.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p className="font-medium">{new Date(doc.updated_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={doc.status === 'active' ? 'default' : 'secondary'} className="capitalize">{doc.status}</Badge>
                </div>
              </div>
              {doc.description && (
                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="mt-1">{doc.description}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {isOwner && (
          <TabsContent value="permissions" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Shared with
                </CardTitle>
              </CardHeader>
              <CardContent>
                {permissions.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">This document has not been shared with anyone</p>
                ) : (
                  <div className="space-y-3">
                    {permissions.map((perm) => (
                      <div key={perm.id} className="flex items-center gap-3 border-b pb-3 last:border-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {perm.user_name?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{perm.user_name || perm.user_email}</p>
                          <p className="text-xs text-muted-foreground">{perm.user_email}</p>
                        </div>
                        <Badge variant={perm.access_level === 'edit' ? 'default' : 'outline'}>
                          {perm.access_level}
                        </Badge>
                        <Button size="sm" variant="ghost" onClick={() => handleRevoke(perm.user_id)}>
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="versions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Version History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {versions.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No version history</p>
              ) : (
                <div className="space-y-3">
                  {versions.map((version) => (
                    <div key={version.id} className="flex items-center gap-3 border-b pb-3 last:border-0">
                      <Badge variant="outline">v{version.version_number}</Badge>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{version.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {version.change_summary} - {new Date(version.created_at).toLocaleString()}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{(version.file_size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
