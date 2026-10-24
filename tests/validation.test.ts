import { describe, expect, it } from 'vitest';
import { safeSearch, pagination, isAllowedFileType, verifyFileSignature, generateStorageKey, uploadSchema } from '../lib/validation';
import { safeAuthRedirect } from '../lib/auth-redirect';

describe('Untrusted input validation', () => {
  it('bounds pagination and rejects malformed numbers', () => {
    expect(pagination(-1, -1)).toEqual({ page: 1, pageSize: 20 });
    expect(pagination('bad', 'bad')).toEqual({ page: 1, pageSize: 20 });
    expect(pagination(1000000, 1000)).toEqual({ page: 100000, pageSize: 100 });
    expect(pagination(2, 5)).toEqual({ page: 2, pageSize: 5 });
  });
  it('removes PostgREST filter delimiters from searches', () => {
    const search = safeSearch('test),owner_id.neq.x,(id.*%');
    expect(search).not.toMatch(/[(),%*]/);
    expect(safeSearch('a'.repeat(500))).toHaveLength(200);
  });
  it('rejects executable extensions and disguised MIME types', () => {
    expect(isAllowedFileType('file.exe', 'application/pdf')).toBe(false);
    expect(isAllowedFileType('file.pdf', 'application/pdf-malware')).toBe(false);
    expect(isAllowedFileType('file.pdf', 'application/pdf')).toBe(true);
  });
  it('rejects mismatched signatures', () => {
    expect(verifyFileSignature(new TextEncoder().encode('fake pdf').buffer, 'pdf')).toBe(false);
    expect(verifyFileSignature(new TextEncoder().encode('%PDF-1.4').buffer, 'pdf')).toBe(true);
  });
  it('rejects missing titles and excessive descriptions', () => {
    expect(uploadSchema.safeParse({ title: '' }).success).toBe(false);
    expect(uploadSchema.safeParse({ title: 'test', description: 'x'.repeat(2001) }).success).toBe(false);
  });
  it('uses opaque unique object keys', () => {
    const first = generateStorageKey('user-id', 'pdf');
    expect(first).toMatch(/^user-id\/[0-9a-f-]{36}\.pdf$/);
    expect(first).not.toBe(generateStorageKey('user-id', 'pdf'));
  });
  it('allows only known local auth callback destinations', () => {
    expect(safeAuthRedirect('//example.test')).toBe('/dashboard');
    expect(safeAuthRedirect('https://example.test')).toBe('/dashboard');
    expect(safeAuthRedirect('/reset-password')).toBe('/reset-password');
  });
});
