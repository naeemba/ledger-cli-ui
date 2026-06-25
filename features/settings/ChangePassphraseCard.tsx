'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { changePassphraseAction } from './actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  changePassphrase,
  type Authorizer,
} from '@/features/crypto/lib/rewrapFlow';

const MIN_LENGTH = 8;

const ChangePassphraseCard = () => {
  const [useForgot, setUseForgot] = useState(false);
  const [currentSecret, setCurrentSecret] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPass.length < MIN_LENGTH) {
      setError(`New passphrase must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPass !== confirmPass) {
      setError('Passphrases do not match.');
      return;
    }

    const authorizer: Authorizer = useForgot
      ? { kind: 'recovery', code: currentSecret }
      : { kind: 'passphrase', passphrase: currentSecret };

    setPending(true);
    try {
      const wrap = await changePassphrase(authorizer, newPass);
      const res = await changePassphraseAction(wrap);
      if (!res.ok) {
        setError(
          res.message ?? 'Could not update passphrase. Please try again.'
        );
        return;
      }
      toast.success('Passphrase updated.');
      setCurrentSecret('');
      setNewPass('');
      setConfirmPass('');
      setUseForgot(false);
    } catch (err) {
      // obtainDek throws 'Incorrect passphrase.' / 'Incorrect recovery code.'
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change passphrase</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="current-secret">
                {useForgot ? 'Recovery code' : 'Current passphrase'}
              </Label>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline transition-colors"
                onClick={() => {
                  setUseForgot((v) => !v);
                  setCurrentSecret('');
                  setError(null);
                }}
              >
                {useForgot
                  ? 'Use passphrase instead'
                  : 'Forgot? Use recovery code'}
              </button>
            </div>
            <Input
              id="current-secret"
              type={useForgot ? 'text' : 'password'}
              autoComplete={useForgot ? 'off' : 'current-password'}
              placeholder={useForgot ? 'xxxx-xxxx-xxxx-xxxx-xxxx' : ''}
              value={currentSecret}
              onChange={(e) => setCurrentSecret(e.target.value)}
              disabled={pending}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-pass">New passphrase</Label>
            <Input
              id="new-pass"
              type="password"
              autoComplete="new-password"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              disabled={pending}
              required
              minLength={MIN_LENGTH}
            />
            {newPass.length > 0 && newPass.length < MIN_LENGTH && (
              <p className="text-muted-foreground text-xs">
                At least {MIN_LENGTH} characters required (
                {MIN_LENGTH - newPass.length} more).
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-pass">Confirm new passphrase</Label>
            <Input
              id="confirm-pass"
              type="password"
              autoComplete="new-password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
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
            disabled={pending || !currentSecret || !newPass || !confirmPass}
          >
            {pending ? 'Updating…' : 'Update passphrase'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ChangePassphraseCard;
