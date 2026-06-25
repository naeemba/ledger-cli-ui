'use client';

import { Copy, Download, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { rotateRecoveryAction } from './actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  rotateRecovery,
  type Authorizer,
} from '@/features/crypto/lib/rewrapFlow';

const RotateRecoveryCard = () => {
  const [useForgot, setUseForgot] = useState(false);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Revealed only after confirmed server-side persist
  const [newCode, setNewCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
    },
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const authorizer: Authorizer = useForgot
      ? { kind: 'recovery', code: secret }
      : { kind: 'passphrase', passphrase: secret };

    setPending(true);
    try {
      const { wrapRecovery, code } = await rotateRecovery(authorizer);
      const res = await rotateRecoveryAction({ wrapRecovery });
      if (!res.ok) {
        // Do NOT reveal code — rotation did not persist.
        setError(
          res.message ?? 'Could not rotate recovery code. Please try again.'
        );
        return;
      }
      // Only reveal after confirmed persist.
      setNewCode(code);
      setSaved(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setPending(false);
    }
  };

  const handleCopy = async () => {
    if (!newCode) return;
    try {
      await navigator.clipboard.writeText(newCode);
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore clipboard errors — user can still copy manually
    }
  };

  const handleDownload = () => {
    if (!newCode) return;
    const blob = new Blob(
      [
        'Ledger Recovery Code\n',
        `Generated: ${new Date().toISOString()}\n\n`,
        newCode,
        '\n\nStore this safely. This code is shown once and cannot be retrieved later.\n',
      ],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ledger-recovery-code.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDone = () => {
    setNewCode(null);
    setSaved(false);
    setSecret('');
    setUseForgot(false);
    toast.success('Recovery code rotated. Keep the new code safe.');
  };

  if (newCode) {
    const groups = newCode.split('-');
    return (
      <Card>
        <CardHeader>
          <CardTitle>New recovery code</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert>
            <AlertDescription>
              This is your new recovery code. It is shown{' '}
              <strong>once only</strong>. Save it somewhere safe before
              continuing.
            </AlertDescription>
          </Alert>

          <div className="rounded-md border bg-muted/50 p-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 justify-center">
              {groups.map((group, i) => (
                <span
                  key={i}
                  className="font-mono text-sm font-semibold tracking-widest select-all rounded px-2 py-1 bg-background border"
                >
                  {group}
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="mr-1.5 size-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 size-3.5" />
                    Copy
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={handleDownload}
              >
                <Download className="mr-1.5 size-3.5" />
                Download
              </Button>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="mt-0.5 size-4 cursor-pointer"
            />
            <span className="text-sm select-none">
              I&apos;ve saved my recovery code in a safe place.
            </span>
          </label>

          <Button
            type="button"
            size="sm"
            className="w-fit"
            disabled={!saved}
            onClick={handleDone}
          >
            Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rotate recovery code</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Generate a new recovery code. Your current recovery code will be
            invalidated immediately.
          </p>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="rotate-secret">
                {useForgot ? 'Recovery code' : 'Current passphrase'}
              </Label>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline transition-colors"
                onClick={() => {
                  setUseForgot((v) => !v);
                  setSecret('');
                  setError(null);
                }}
              >
                {useForgot
                  ? 'Use passphrase instead'
                  : 'Forgot? Use recovery code'}
              </button>
            </div>
            <Input
              id="rotate-secret"
              type={useForgot ? 'text' : 'password'}
              autoComplete={useForgot ? 'off' : 'current-password'}
              placeholder={useForgot ? 'xxxx-xxxx-xxxx-xxxx-xxxx' : ''}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              disabled={pending}
              required
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            size="sm"
            className="w-fit"
            disabled={pending || !secret}
          >
            {pending ? 'Rotating…' : 'Rotate recovery code'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default RotateRecoveryCard;
