import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { NextRequest, NextResponse } from 'next/server';

const execFilePromise = promisify(execFile);

const uploadDir = path.join(process.cwd(), 'uploads');
const ALLOWED_EXTENSIONS = new Set(['.ledger', '.dat', '.journal', '.txt']);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const data = await req.formData();
  const file = data.get('file');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 });
  }

  const safeName = path.basename(file.name);
  const ext = path.extname(safeName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: 'Unsupported file type' },
      { status: 415 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, safeName);
  await fs.writeFile(filePath, buffer);

  try {
    const { stdout } = await execFilePromise('ledger', ['-f', filePath, 'bal']);
    return NextResponse.json({ data: stdout });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'ledger failed';
    console.error(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
