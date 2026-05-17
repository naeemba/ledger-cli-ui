'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth/client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

const friendlyError = (raw: unknown): string => {
  const message = raw instanceof Error ? raw.message : String(raw);
  if (/cancel|abort|NotAllowedError/i.test(message))
    return 'Passkey prompt was dismissed. Try again.';
  if (/NotSupportedError|not supported/i.test(message))
    return 'Passkeys are not supported on this device or browser.';
  if (/no credentials|no passkey|registered/i.test(message))
    return 'No passkey found for this site on this device.';
  return message || 'Sign-in failed';
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) throw new Error(result.error.message);
      router.push(next);
      router.refresh();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">
          Authenticate with your passkey.
        </p>

        <Button onClick={handleSignIn} disabled={busy} className="mt-6 w-full">
          {busy ? 'Waiting for passkey…' : 'Sign in with passkey'}
        </Button>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <p className="mt-6 text-sm text-muted">
          No account yet?{' '}
          <Link href="/signup" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
