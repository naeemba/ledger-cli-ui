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
import { PRF_SALT } from '@/features/crypto/lib/clientCrypto';
import {
  tryUnlockFromWebAuthn,
  type WebAuthnResult,
} from '@/features/crypto/lib/passkeyFlow';
import { authClient } from '@/lib/auth-client';
import { useWebAuthnSupported } from '@naeemba/next-starter/client';
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
  const [resendAllowed, setResendAllowed] = useState(false);
  const passkeySupported = useWebAuthnSupported();
  const showSocial = passkeySupported || googleEnabled;

  useEffect(() => {
    const lastSentAt = state.lastSentAt;
    if (lastSentAt === null) return;
    const remaining = Math.max(
      0,
      RESEND_COOLDOWN_MS - (Date.now() - lastSentAt)
    );
    const syncId = setTimeout(
      () => setResendAllowed(canResend(lastSentAt, Date.now())),
      0
    );
    const enableId = setTimeout(
      () => setResendAllowed(canResend(lastSentAt, Date.now())),
      remaining
    );
    return () => {
      clearTimeout(syncId);
      clearTimeout(enableId);
    };
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
    let webauthn: WebAuthnResult | undefined;
    return runAttempt(
      'passkey',
      async () => {
        const res = await authClient.signIn.passkey({
          extensions: {
            prf: { eval: { first: PRF_SALT as unknown as BufferSource } },
          },
          returnWebAuthnResponse: true,
        } as Parameters<typeof authClient.signIn.passkey>[0]);
        if (res && 'webauthn' in res && res.webauthn) {
          webauthn = res.webauthn as unknown as WebAuthnResult;
        }
        return res;
      },
      async () => {
        // Best-effort: unlock the journal from the same ceremony's PRF output.
        // Never throws; falls through to passphrase unlock when unavailable.
        await tryUnlockFromWebAuthn(webauthn);
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
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <h1 className="au-grad ff-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.05]">
          {copy.heading}
        </h1>
        <p className="text-[0.95rem] text-[color:var(--txt-dim)]">
          {copy.subheading}
        </p>
      </div>

      {showSocial && (
        <>
          <div className="flex flex-col gap-2.5">
            {passkeySupported && (
              <button
                type="button"
                className="au-btn au-btn--ghost"
                onClick={onPasskey}
                disabled={sending}
              >
                <Fingerprint className="size-4" aria-hidden />
                Continue with a passkey
              </button>
            )}
            {googleEnabled && (
              <button
                type="button"
                className="au-btn au-btn--ghost"
                onClick={onGoogle}
                disabled={sending}
              >
                Continue with Google
              </button>
            )}
            {passkeySupported && state.status.passkey === 'error' && (
              <p className="au-error" aria-live="polite">
                {state.errors.passkey}
              </p>
            )}
            {state.status.google === 'error' && (
              <p className="au-error" aria-live="polite">
                {state.errors.google}
              </p>
            )}
          </div>

          <div className="au-sep ff-mono">or</div>
        </>
      )}

      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <div>
          <label className="au-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="au-input"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <button
          type="submit"
          className="au-btn au-btn--primary"
          disabled={sending}
        >
          {state.status.magicLink === 'sending' ? 'Sending…' : copy.submitLabel}
        </button>
        {state.status.magicLink === 'error' && (
          <p className="au-error" aria-live="polite">
            {state.errors.magicLink}
          </p>
        )}
      </form>

      <p className="text-sm text-[color:var(--txt-faint)]">
        {copy.altPrompt}{' '}
        <Link href={copy.altHref} className="au-link">
          {copy.altLinkLabel}
        </Link>
      </p>
    </div>
  );
}
