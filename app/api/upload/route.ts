import path from 'path';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { NextResponse, type NextRequest } from 'next/server';

const ALLOWED_SINGLE_EXTS = new Set(['.ledger', '.dat', '.journal', '.txt']);
const ZIP_EXT = '.zip';
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  const data = await req.formData();
  const file = data.get('file');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
      { status: 413 }
    );
  }

  const safeName = path.basename(file.name);
  const ext = path.extname(safeName).toLowerCase();

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    if (ext === ZIP_EXT) {
      const result = await journalService.replaceFromZip(user.id, buffer);
      return NextResponse.json({
        ok: true,
        mode: 'archive',
        mainFile: result.mainFile,
        fileCount: result.fileCount,
        uidsAdded: result.uidsAdded,
        bytes: buffer.length,
        ...(result.parseFailure ? { parseFailure: result.parseFailure } : {}),
      });
    }

    if (ALLOWED_SINGLE_EXTS.has(ext)) {
      const result = await journalService.replaceFromSingleFile(
        user.id,
        buffer
      );
      return NextResponse.json({
        ok: true,
        mode: 'single',
        uidsAdded: result.uidsAdded,
        bytes: buffer.length,
        ...(result.parseFailure ? { parseFailure: result.parseFailure } : {}),
      });
    }

    return NextResponse.json(
      {
        error:
          'Unsupported file type. Upload a single .ledger/.dat/.journal/.txt or a .zip archive.',
      },
      { status: 415 }
    );
  } catch (e) {
    console.error('upload failed', e);
    const message = e instanceof Error ? e.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
