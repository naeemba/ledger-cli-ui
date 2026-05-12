'use client';

import { useActionState, useEffect, useState } from 'react';
import { signupAction, type SignupState } from './actions';
import { APP_NAME } from '@/lib/app';
import { authClient } from '@/lib/auth/client';
import getDeviceName from '@/utils/deviceName';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const initialState: SignupState = { ok: false };

const fieldError = (state: SignupState | null, field: string) =>
  state?.errors?.[field as keyof NonNullable<SignupState['errors']>];

type PasskeyPhase = 'idle' | 'registering' | 'error';

export default function SignupPage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    signupAction,
    initialState
  );
  const [passkeyPhase, setPasskeyPhase] = useState<PasskeyPhase>('idle');
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  useEffect(() => {
    if (!state?.ok) return;
    let cancelled = false;
    (async () => {
      setPasskeyPhase('registering');
      setPasskeyError(null);
      try {
        const result = await authClient.passkey.addPasskey({
          name: `${APP_NAME} · ${getDeviceName()}`,
        });
        if (result?.error) throw new Error(result.error.message);
        if (cancelled) return;
        router.push('/');
        router.refresh();
      } catch (e) {
        if (cancelled) return;
        setPasskeyPhase('error');
        setPasskeyError(
          e instanceof Error ? e.message : 'Passkey registration failed'
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, router]);

  const busy = isPending || passkeyPhase === 'registering';
  const buttonLabel = isPending
    ? 'Creating your account…'
    : passkeyPhase === 'registering'
      ? 'Registering your passkey…'
      : 'Create account with passkey';

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-muted">
          You&apos;ll sign up with a passkey — no password to remember.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <Field
            label="Name"
            name="name"
            type="text"
            autoComplete="name"
            error={fieldError(state, 'name')}
          />
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            error={fieldError(state, 'email')}
          />

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {buttonLabel}
          </button>

          {fieldError(state, 'form') && (
            <ErrorBox>{fieldError(state, 'form')}</ErrorBox>
          )}
          {passkeyError && <ErrorBox>{passkeyError}</ErrorBox>}
        </form>

        <p className="mt-6 text-sm text-muted">
          Already have an account?{' '}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

const Field = ({
  label,
  name,
  type,
  autoComplete,
  error,
}: {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
  error?: string;
}) => (
  <label className="flex flex-col gap-1">
    <span className="text-xs font-medium uppercase tracking-wider text-muted">
      {label}
    </span>
    <input
      type={type}
      name={name}
      required
      autoComplete={autoComplete}
      aria-invalid={!!error}
      className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40 aria-[invalid=true]:border-negative"
    />
    {error && <span className="text-xs text-negative">{error}</span>}
  </label>
);

const ErrorBox = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-md border border-negative/30 bg-negative/10 p-3 text-sm text-negative">
    {children}
  </div>
);
