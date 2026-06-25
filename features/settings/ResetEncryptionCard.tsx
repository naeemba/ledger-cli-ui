'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  requestEncryptionResetAction,
  confirmEncryptionResetAction,
} from './actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Phase = 'idle' | 'code-sent';

const ResetEncryptionCard = () => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sendCode = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await requestEncryptionResetAction();
      if (!res.ok) {
        if (res.reason === 'throttled') {
          toast.error('Please wait a moment before requesting another code.');
        } else if (res.reason === 'not-set-up') {
          toast.error('Encryption is not set up for this account.');
        } else {
          toast.error('Could not send a verification code. Please try again.');
        }
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

  const confirmReset = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await confirmEncryptionResetAction(code);
      if (res.ok) {
        // Hard nav so the crypto gate sees the reset state and re-routes to setup.
        window.location.assign('/crypto/setup');
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
      setError('Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Reset encryption</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant="destructive">
          <AlertTitle>This action is irreversible</AlertTitle>
          <AlertDescription>
            Resetting encryption permanently deletes your encrypted journal and
            all its data. You will need to set up encryption again from scratch.
            This cannot be undone.
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
              <Label htmlFor="reset-code">
                Enter the 6-digit code from your email
              </Label>
              <Input
                id="reset-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="w-40 tracking-[0.3em]"
                disabled={pending}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={pending || code.length !== 6}
                onClick={confirmReset}
              >
                Confirm reset
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={sendCode}
              >
                Resend
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ResetEncryptionCard;
