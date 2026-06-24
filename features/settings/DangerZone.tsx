'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { deleteAccountAction, requestAccountDeletionAction } from './actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

type Phase = 'idle' | 'code-sent';

const DangerZone = () => {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sendCode = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await requestAccountDeletionAction();
      if (!res.ok) {
        toast.error('Please wait a moment before requesting another code.');
        return;
      }
      setPhase('code-sent');
      toast.success('Verification code sent to your email.');
    } catch {
      // The server logs the real cause (e.g. email transport down); surface a
      // generic failure so the user knows the request did not go through.
      toast.error('Could not send a verification code. Please try again.');
    } finally {
      setPending(false);
    }
  };

  const confirmDelete = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await deleteAccountAction(code);
      if (res.ok) {
        try {
          await authClient.signOut();
        } catch {
          // account is already deleted server-side; the session is invalid regardless
        }
        router.push('/account/deleted');
        return;
      }
      switch (res.reason) {
        case 'no-code':
          setError('Request a new code.');
          setPhase('idle');
          setCode('');
          break;
        case 'expired':
          setError('That code expired. Request a new one.');
          setPhase('idle');
          setCode('');
          break;
        case 'too-many-attempts':
          setError('Too many attempts. Request a new code.');
          setPhase('idle');
          setCode('');
          break;
        case 'invalid':
          setError(
            res.remaining > 0
              ? `Incorrect code. ${res.remaining} attempt(s) left.`
              : 'Enter the 6-digit code from your email.'
          );
          break;
      }
    } catch {
      // Deletion is irreversible and may partially complete server-side (e.g.
      // remote-storage cleanup failing mid-purge). Never fail silently — the
      // server logs the real cause; surface a generic error so the user knows.
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Download a backup</span>
          <p className="text-muted-foreground text-sm">
            Export a .zip of your journal before deleting. Recommended.
          </p>
          <a
            href="/api/account/export"
            className={
              buttonVariants({ variant: 'outline', size: 'sm' }) + ' w-fit'
            }
          >
            Download backup (.zip)
          </a>
        </div>

        <Alert variant="destructive">
          <AlertTitle>Delete account</AlertTitle>
          <AlertDescription>
            This permanently deletes your journals and your account. This cannot
            be undone.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {phase === 'idle' ? (
          <Button
            variant="destructive"
            size="sm"
            className="w-fit"
            disabled={pending}
            onClick={sendCode}
          >
            Email me a verification code
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deletion-code">
                Enter the 6-digit code from your email
              </Label>
              <Input
                id="deletion-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="w-40 tracking-[0.3em]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={pending || code.length !== 6}
                onClick={confirmDelete}
              >
                Permanently delete my account
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setPhase('idle');
                  setCode('');
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DangerZone;
