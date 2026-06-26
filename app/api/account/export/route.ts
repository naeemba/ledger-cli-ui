import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { requireUser } from '@/lib/auth/require-user';
import { getJournalDir } from '@/lib/journal/layout';
import { createLogger } from '@/lib/log';
import { listLocalRelPaths } from '@/lib/storage/manifest';
import { pullLocked } from '@/lib/storage/sync';
import { NextResponse } from 'next/server';

const log = createLogger('export');

export const dynamic = 'force-dynamic';

/** Build a .zip of every file under `dir`, keyed by POSIX relative path. */
export async function buildJournalZip(dir: string): Promise<Buffer> {
  const zip = new AdmZip();
  const relPaths = await listLocalRelPaths(dir);
  for (const rel of relPaths) {
    const data = await fs.readFile(path.join(dir, rel));
    zip.addFile(rel.split(path.sep).join('/'), data);
  }
  return zip.toBuffer();
}

export async function GET(): Promise<Response> {
  const user = await requireUser();
  try {
    await pullLocked(user.id);
    const buf = await buildJournalZip(getJournalDir(user.id));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="journals-${user.id}-backup.zip"`,
      },
    });
  } catch (e) {
    log.error({ err: e }, 'journal backup export failed');
    return NextResponse.json(
      { error: 'Could not export your journal' },
      { status: 500 }
    );
  }
}
