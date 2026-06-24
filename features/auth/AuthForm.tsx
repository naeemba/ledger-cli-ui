'use client';

import { Fingerprint } from 'lucide-react';
import { useEffect, useReducer, useState, type FormEvent } from 'react';
import { SentNotice } from './SentNotice';
import { getAuthCopy, type AuthMode } from './authCopy';
import {
  authReducer,
  canResend,
  initialAuthState,
  RESEND_COOLDOWN_MS,
  type Method,
} from './authState';
import { resolveCallbackUrl } from './callbackUrl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { authClient } from '@/lib/auth-client';
import Link from 'next/link';

const CALLBACK_URL = '/dashboard';
const ERROR_CALLBACK_URL = '/sign-in/error';
const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === '1';

interface AuthFormProps {
  mode: AuthMode;
}

export function AuthForm({ mode }: AuthFormProps) {
  const copy = getAuthCopy(mode);
  const [email, setEmail] = useState('');
  const [state, dispatch] = useReducer(authReducer, initialAuthState);
  const [resendAllowed, setResendAllowed] = useState(true);

  useEffect(() => {
    if (state.lastSentAt === null) return;
    const elapsed = Date.now() - state.lastSentAt;
    const delay = Math.max(0, RESEND_COOLDOWN_MS - elapsed);
    const id = setTimeout(() => setResendAllowed(true), delay);
    return () => clearTimeout(id);
  }, [state.lastSentAt]);

  async function runAttempt(
    method: Method,
    call: () => Promise<{
      error: { message?: string | null } | null | undefined;
    }>,
    onSuccess?: () => void
  ) {
    dispatch({ type: 'start', method });
    try {
      const { error } = await call();
      if (error) {
        dispatch({
          type: 'fail',
          method,
          message: error.message ?? 'Something went wrong.',
        });
        return;
      }
      dispatch({ type: 'success', method, at: Date.now() });
      onSuccess?.();
    } catch (err) {
      dispatch({
        type: 'fail',
        method,
        message: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  function sendMagicLink() {
    const callbackURL = resolveCallbackUrl('callbackUrl', CALLBACK_URL);
    return runAttempt('magicLink', () =>
      authClient.signIn.magicLink({
        email,
        callbackURL,
        errorCallbackURL: ERROR_CALLBACK_URL,
      })
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void sendMagicLink();
  }

  function onGoogle() {
    const social = authClient.signIn.social;
    const callbackURL = resolveCallbackUrl('callbackUrl', CALLBACK_URL);
    return runAttempt('google', () =>
      social({ provider: 'google', callbackURL })
    );
  }

  function onPasskey() {
    const passkey = authClient.signIn.passkey;
    return runAttempt(
      'passkey',
      () => passkey(),
      () => {
        const callbackURL = resolveCallbackUrl('callbackUrl', CALLBACK_URL);
        window.location.assign(callbackURL);
      }
    );
  }

  if (state.status.magicLink === 'sent') {
    return (
      <SentNotice
        email={email}
        canResend={resendAllowed}
        onResend={() => void sendMagicLink()}
        onUseDifferentEmail={() => dispatch({ type: 'reset' })}
      />
    );
  }

  const sending =
    state.status.magicLink === 'sending' ||
    state.status.google === 'sending' ||
    state.status.passkey === 'sending';

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1.5 text-center lg:text-left">
        <h1 className="text-2xl font-semibold tracking-tight">
          {copy.heading}
        </h1>
        <p className="text-sm text-muted-foreground">{copy.subheading}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onPasskey}
          disabled={sending}
        >
          <Fingerprint className="size-4" aria-hidden />
          Continue with a passkey
        </Button>
        {googleEnabled && (
          <Button
            type="button"
            variant="outline"
            onClick={onGoogle}
            disabled={sending}
          >
            Continue with Google
          </Button>
        )}
        {state.status.passkey === 'error' && (
          <p className="text-sm text-destructive" aria-live="polite">
            {state.errors.passkey}
          </p>
        )}
        {state.status.google === 'error' && (
          <p className="text-sm text-destructive" aria-live="polite">
            {state.errors.google}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        or
        <Separator className="flex-1" />
      </div>

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <Button type="submit" disabled={sending}>
          {state.status.magicLink === 'sending' ? 'Sending…' : copy.submitLabel}
        </Button>
        {state.status.magicLink === 'error' && (
          <p className="text-sm text-destructive" aria-live="polite">
            {state.errors.magicLink}
          </p>
        )}
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {copy.altPrompt}{' '}
        <Link
          href={copy.altHref}
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          {copy.altLinkLabel}
        </Link>
      </p>
    </div>
  );
}
