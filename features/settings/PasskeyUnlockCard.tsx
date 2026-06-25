'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  disablePasskeyUnlockAction,
  enablePasskeyUnlockAction,
} from './actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getMaterial } from '@/features/crypto/lib/cryptoMaterial';
import { buildPasskeyWrap } from '@/features/crypto/lib/passkeyFlow';
import { obtainDek, type Authorizer } from '@/features/crypto/lib/rewrapFlow';

type AuthPasskey = { credentialID: string; name?: string };
type Row = { credentialId: string; name: string; enabled: boolean };

async function fetchPasskeys(): Promise<AuthPasskey[]> {
  const res = await fetch('/api/auth/passkey/list-user-passkeys', {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) return [];
  return (await res.json()) as AuthPasskey[];
}

const PasskeyUnlockCard = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [useForgot, setUseForgot] = useState(false);
  const [secret, setSecret] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [passkeys, material] = await Promise.all([
        fetchPasskeys(),
        getMaterial(),
      ]);
      const enabled = new Set(material.passkeys.map((p) => p.credentialId));
      setRows(
        passkeys.map((p) => ({
          credentialId: p.credentialID,
          name: p.name ?? 'Passkey',
          enabled: enabled.has(p.credentialID),
        }))
      );
    } catch {
      setError('Could not load your passkeys.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  async function handleEnable(row: Row) {
    setError(null);
    if (!secret) {
      setError('Enter your passphrase or recovery code first.');
      return;
    }
    const authorizer: Authorizer = useForgot
      ? { kind: 'recovery', code: secret }
      : { kind: 'passphrase', passphrase: secret };
    setBusyId(row.credentialId);
    try {
      const dek = await obtainDek(authorizer);
      const input = await buildPasskeyWrap(dek, row.credentialId, row.name);
      const res = await enablePasskeyUnlockAction(input);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      toast.success(`${row.name} can now unlock your journal.`);
      setSecret('');
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not enable passkey unlock.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDisable(row: Row) {
    setError(null);
    setBusyId(row.credentialId);
    try {
      const res = await disablePasskeyUnlockAction({
        credentialId: row.credentialId,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      toast.success(`${row.name} can no longer unlock your journal.`);
      await refresh();
    } catch {
      setError('Could not disable passkey unlock.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlock with a passkey</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Let a passkey unlock your encrypted journal, alongside your passphrase
          and recovery code. Enabling a passkey requires your passphrase (or
          recovery code) to prove it&apos;s you.
        </p>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="passkey-secret">
              {useForgot ? 'Recovery code' : 'Current passphrase'}
            </Label>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 transition-colors hover:underline"
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
            id="passkey-secret"
            type={useForgot ? 'text' : 'password'}
            autoComplete={useForgot ? 'off' : 'current-password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading passkeys…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You have no passkeys yet. Add one under{' '}
            <a className="underline" href="/settings/passkeys">
              Passkeys
            </a>{' '}
            first.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.credentialId}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <span className="text-sm font-medium">{row.name}</span>
                {row.enabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === row.credentialId}
                    onClick={() => handleDisable(row)}
                  >
                    {busyId === row.credentialId
                      ? 'Removing…'
                      : 'Disable unlock'}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={busyId === row.credentialId}
                    onClick={() => handleEnable(row)}
                  >
                    {busyId === row.credentialId
                      ? 'Enabling…'
                      : 'Enable unlock'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default PasskeyUnlockCard;
