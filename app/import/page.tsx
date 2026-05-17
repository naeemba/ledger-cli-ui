'use client';

import { useState } from 'react';
import Help from '@/components/Help';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

type Phase = 'idle' | 'uploading' | 'done' | 'error';

type UploadResult = {
  ok: boolean;
  mode?: 'single' | 'archive';
  mainFile?: string;
  fileCount?: number;
  bytes?: number;
  error?: string;
};

export default function ImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setPhase('uploading');
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const result: UploadResult = await res.json();
      if (!res.ok || !result.ok)
        throw new Error(result.error ?? 'Upload failed');
      setPhase('done');
      if (result.mode === 'archive') {
        setMessage(
          `Imported ${result.fileCount} file${result.fileCount === 1 ? '' : 's'} (${(result.bytes ?? 0).toLocaleString()} bytes). Main file: ${result.mainFile}.`
        );
      } else {
        setMessage(
          `Imported ${(result.bytes ?? 0).toLocaleString()} bytes. Reports refresh on next view.`
        );
      }
      router.refresh();
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Import journal
          </h1>
          <Help label="About importing">
            Upload either a single Ledger file (saved as{' '}
            <code>main.ledger</code>) or a <code>.zip</code> archive containing
            your full journal (main file + any <code>include</code>d files +
            optional <code>price-db.ledger</code>). The archive structure is
            preserved on disk so <code>include</code> directives resolve. Max 25
            MB.
          </Help>
        </div>
        <p className="mt-1 text-sm text-muted">
          Replace your journal with an existing file or archive
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <label className="flex flex-col gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Journal file or .zip archive
          </span>
          <input
            type="file"
            accept=".ledger,.dat,.journal,.txt,.zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-fg file:mr-4 file:rounded-md file:border file:border-border file:bg-bg file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:file:bg-subtle"
          />
        </label>

        <Button
          type="submit"
          disabled={!file || phase === 'uploading'}
          className="self-start"
        >
          {phase === 'uploading' ? 'Uploading…' : 'Replace my journal'}
        </Button>

        {message && (
          <div
            className={
              phase === 'error'
                ? 'rounded-md border border-negative/30 bg-negative/10 p-3 text-sm text-negative'
                : 'rounded-md border border-positive/30 bg-positive/10 p-3 text-sm text-positive'
            }
          >
            {message}
          </div>
        )}
      </form>

      <div className="rounded-2xl border border-border bg-card p-5 text-xs text-muted shadow-sm">
        <div className="mb-2 font-medium text-fg">Tips</div>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <strong>Multiple files?</strong>
            {' Zip them up: '}
            <code>cd journals && zip -r journal.zip .</code>
          </li>
          <li>
            <strong>Main file:</strong>
            {' the importer prefers '}
            <code>main.ledger</code>
            {' or '}
            <code>ledger.ledger</code>
            {
              ' at the archive root. Other names are picked by shallowest-depth fallback.'
            }
          </li>
          <li>
            <strong>Price database:</strong>
            {' include a file named '}
            <code>price-db.ledger</code>
            {' at the root and it’s wired in automatically.'}
          </li>
        </ul>
      </div>
    </div>
  );
}
