/*
# Create private documents storage bucket

## Overview
Creates a private Supabase Storage bucket for document files.
All access is mediated by server-side endpoints that check permissions.

## Security
- Bucket is private (not public)
- No public read/write access
- Files are accessed only through server-side code using the service role key
- Storage keys are opaque UUIDs, not user-supplied filenames
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;
