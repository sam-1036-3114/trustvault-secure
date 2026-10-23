import { NextRequest, NextResponse } from 'next/server';
import { downloadDocument } from '@/lib/document-service';
import { AuthError } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const result = await downloadDocument(params.id);
    if (result.error) {
      const status = result.error === 'Access denied' ? 403 : result.error === 'Document not found' ? 404 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }
    if (!result.data) {
      return NextResponse.json({ error: 'No file data' }, { status: 500 });
    }

    return new NextResponse(result.data, {
      headers: {
        'Content-Type': result.contentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
        'Content-Length': result.data.byteLength.toString(),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.code === 'UNAUTHENTICATED' ? 401 : 403 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
