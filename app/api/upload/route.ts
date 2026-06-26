import path from 'path';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { journalQuotaMb, getJournalDirSize } from '@/lib/journal/quota';
import { createLogger } from '@/lib/log';
import { rateLimit, UPLOAD } from '@/lib/rate-limit';
import { NextResponse, type NextRequest } from 'next/server';

const log = createLogger('upload');

const ALLOWED_SINGLE_EXTS = new Set(['.ledger', '.dat', '.journal', '.txt']);
const ZIP_EXT = '.zip';
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();
  const limit = rateLimit(UPLOAD, user.id);
  if (!limit.allowed) {
    const retryAfter = Math.ceil((limit.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Too many uploads. Please wait a moment and try again.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, retryAfter)) },
      }
    );
  }
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
  const bytesBefore = await getJournalDirSize(user.id);
  const meta = await auditRequestMeta();

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    if (ext === ZIP_EXT) {
      const result = await journalService.replaceFromZip(user.id, buffer);
      if (result.quotaExceeded) {
        await auditService.record(user.id, {
          action: 'journal.import',
          result: 'failure',
          bytesBefore,
          bytesAfter: await getJournalDirSize(user.id),
          detail: { kind: 'zip', reason: 'quota' },
          ...meta,
        });
        return NextResponse.json(
          {
            error: `Importing this would exceed your ${journalQuotaMb()} MB journal limit.`,
          },
          { status: 413 }
        );
      }
      const bytesAfter = await getJournalDirSize(user.id);
      await auditService.record(user.id, {
        action: 'journal.import',
        result: 'success',
        bytesBefore,
        bytesAfter,
        detail: {
          kind: 'zip',
          ...(result.parseFailure ? { parseFailure: true } : {}),
        },
        ...meta,
      });
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
      if (result.quotaExceeded) {
        await auditService.record(user.id, {
          action: 'journal.import',
          result: 'failure',
          bytesBefore,
          bytesAfter: await getJournalDirSize(user.id),
          detail: { kind: 'single', reason: 'quota' },
          ...meta,
        });
        return NextResponse.json(
          {
            error: `Importing this would exceed your ${journalQuotaMb()} MB journal limit.`,
          },
          { status: 413 }
        );
      }
      const bytesAfter = await getJournalDirSize(user.id);
      await auditService.record(user.id, {
        action: 'journal.import',
        result: 'success',
        bytesBefore,
        bytesAfter,
        detail: {
          kind: 'single',
          ...(result.parseFailure ? { parseFailure: true } : {}),
        },
        ...meta,
      });
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
    log.error({ err: e }, 'upload failed');
    await auditService.record(user.id, {
      action: 'journal.import',
      result: 'failure',
      bytesBefore,
      bytesAfter: await getJournalDirSize(user.id),
      detail: { reason: 'write-failed' },
      ...meta,
    });
    const message = e instanceof Error ? e.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
