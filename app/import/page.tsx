'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import Help from '@/components/Help';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';

type Phase = 'idle' | 'uploading' | 'done' | 'error';

type UploadResult = {
  ok: boolean;
  mode?: 'single' | 'archive';
  mainFile?: string;
  fileCount?: number;
  bytes?: number;
  uidsAdded?: number;
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
      const tagged =
        result.uidsAdded && result.uidsAdded > 0
          ? `, ${result.uidsAdded} transaction${result.uidsAdded === 1 ? '' : 's'} tagged`
          : '';
      const description =
        result.mode === 'archive'
          ? `Imported ${result.fileCount} file${result.fileCount === 1 ? '' : 's'}${tagged}. Main file: ${result.mainFile}.`
          : `Imported ${(result.bytes ?? 0).toLocaleString()} bytes${tagged}. Reports refresh on next view.`;
      setMessage(description);
      toast.success('Journal imported', { description });
      router.refresh();
    } catch (err) {
      setPhase('error');
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  return (
    <div className="flex flex-col gap-6">
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
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="import-file">Journal file or .zip archive</Label>
          <Input
            id="import-file"
            type="file"
            accept=".ledger,.dat,.journal,.txt,.zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <Button
          type="submit"
          disabled={!file || phase === 'uploading'}
          className="self-start"
        >
          {phase === 'uploading' ? 'Uploading…' : 'Replace my journal'}
        </Button>

        {message && (
          <Alert variant={phase === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
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
