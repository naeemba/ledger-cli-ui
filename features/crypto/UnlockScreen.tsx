'use client';

import { KeyRound, ShieldCheck } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import '@/features/auth/auth.css';
import { finalizeEncryption } from '@/features/crypto/actions/finalizeEncryption';
import { CRYPTO_COPY } from '@/features/crypto/cryptoCopy';
import { getMaterial } from '@/features/crypto/lib/cryptoMaterial';
import { unlockWithPasskey } from '@/features/crypto/lib/passkeyFlow';
import {
  unlockWithPassphrase,
  unlockWithRecovery,
} from '@/features/crypto/lib/unlockFlow';
import { APP_NAME } from '@/lib/app';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';

// Same display + mono pairing as the auth screen so the unlock page reads
// with the same deep-green editorial voice.
const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  style: ['normal', 'italic'],
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

const copy = CRYPTO_COPY.unlock;

// Decorative lock-tick marks that echo the brand panel's sparkbars —
// visual motif communicating "encrypted / secure state".
const LOCK_TICKS = [12, 20, 16, 26, 22, 32, 18, 28, 24, 30] as const;

function CryptoBrandPanel() {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-[var(--line-soft)] bg-[var(--ink-2)]/40 p-10 lg:flex lg:p-12">
      {/* wordmark */}
      <Link
        href="/"
        className="au-rise relative z-10 flex items-center gap-2.5"
        style={{ ['--d' as string]: '0.05s' }}
        aria-label={`${APP_NAME} home`}
      >
        <span className="au-mark ff-mono text-sm">L</span>
        <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
      </Link>

      {/* editorial center */}
      <div className="relative z-10 max-w-md space-y-8">
        <span
          className="au-rise au-chip ff-mono"
          style={{ ['--d' as string]: '0.12s' }}
        >
          <span className="au-chip__dot" />
          END-TO-END ENCRYPTED
        </span>

        <h2
          className="au-rise ff-display text-[clamp(2.25rem,3.4vw,3.25rem)] leading-[1.04]"
          style={{ ['--d' as string]: '0.2s' }}
        >
          Your journal. Encrypted. Only you hold the key.
        </h2>

        {/* Key / lock illustration card */}
        <div
          className="au-rise au-card au-card--lit p-0"
          style={{ ['--d' as string]: '0.3s' }}
        >
          <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--red)]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--em)]/70" />
            <span className="ff-mono ml-2 text-xs text-[color:var(--txt-faint)]">
              journal.ledger
            </span>
            <ShieldCheck
              className="ml-auto size-3.5 text-[color:var(--em)]"
              aria-hidden
            />
          </div>
          <div className="ff-mono px-5 py-4 text-[0.78rem] leading-relaxed">
            <p className="text-[color:var(--txt-faint)]">
              ; encrypted with AES-256-GCM
            </p>
            <p className="mt-1 text-[color:var(--gold)]">2026/06/01</p>
            <p className="mt-0.5 text-[color:var(--txt-dim)]">
              {'  '}Assets:Checking
              {'   '}
              <span className="text-[color:var(--em)]">$ 6,200.00</span>
            </p>
            <p className="mt-0.5 text-[color:var(--txt-dim)]">
              {'  '}Income:Salary
            </p>
          </div>
        </div>

        {/* decorative lock bars — echoes the sparkbars on BrandPanel */}
        <div
          className="au-rise au-bars"
          style={{ ['--d' as string]: '0.38s' }}
          aria-hidden
        >
          {LOCK_TICKS.map((h, i) => (
            <span key={i} style={{ height: `${h}px` }} />
          ))}
        </div>
      </div>

      {/* security feature ticks */}
      <ul
        className="au-rise relative z-10 space-y-2.5"
        style={{ ['--d' as string]: '0.46s' }}
      >
        {(
          [
            'Client-side encryption',
            'Zero-knowledge',
            'Passphrase-protected',
          ] as const
        ).map((f) => (
          <li key={f} className="au-tick">
            <KeyRound className="size-4" aria-hidden />
            {f}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function resolveCallback(): string {
  if (typeof window === 'undefined') return '/dashboard';
  const fromQuery = new URLSearchParams(window.location.search).get(
    'callbackUrl'
  );
  if (fromQuery?.startsWith('/') && !fromQuery.startsWith('//')) {
    return fromQuery;
  }
  return '/dashboard';
}

function UnlockForm() {
  const [mode, setMode] = useState<'passphrase' | 'recovery'>('passphrase');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);

  useEffect(() => {
    void getMaterial()
      .then((m) => setHasPasskey(m.passkeys.length > 0))
      .catch(() => setHasPasskey(false));
  }, []);

  async function handlePasskey() {
    setError(null);
    setPending(true);
    try {
      await unlockWithPasskey();
      await finalizeEncryption().catch(() => {});
      window.location.assign(resolveCallback());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : CRYPTO_COPY.errors.unlockFailed
      );
      setPending(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === 'passphrase') {
        await unlockWithPassphrase(value);
      } else {
        await unlockWithRecovery(value);
      }
      // Reconcile any journal that was left plaintext-at-rest if a prior setup
      // was abandoned after the userCrypto row was written but before the bulk
      // migration ran. finalizeEncryption short-circuits on the persisted
      // `migratedAt` flag, so for the common already-migrated case this is a
      // single DB read with no journal pull/push. Only the rare partial-setup
      // user pays the one-time migration cost. Best-effort: a failure here must
      // not block entry, since the DEK is now in-session and the data layer
      // re-encrypts on the next mutating push regardless.
      await finalizeEncryption().catch(() => {});
      window.location.assign(resolveCallback());
    } catch (err) {
      setError(
        err instanceof Error ? err.message : CRYPTO_COPY.errors.unlockFailed
      );
      setPending(false);
    }
  }

  function toggleMode() {
    setMode((m) => (m === 'passphrase' ? 'recovery' : 'passphrase'));
    setValue('');
    setError(null);
  }

  const isPassphrase = mode === 'passphrase';

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

      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div>
          <label className="au-label" htmlFor="unlock-value">
            {isPassphrase
              ? CRYPTO_COPY.passphrase.label
              : CRYPTO_COPY.recovery.label}
          </label>
          <input
            id="unlock-value"
            key={mode}
            className="au-input"
            type={isPassphrase ? 'password' : 'text'}
            required
            autoComplete={isPassphrase ? 'current-password' : 'off'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              isPassphrase
                ? copy.passphrasePlaceholder
                : copy.recoveryPlaceholder
            }
            disabled={pending}
            autoFocus
          />
        </div>

        <button
          type="submit"
          className="au-btn au-btn--primary"
          disabled={pending}
        >
          {pending ? copy.unlockingLabel : copy.submitLabel}
        </button>

        <p className="au-error" aria-live="polite" aria-atomic="true">
          {error ?? ''}
        </p>
      </form>

      {hasPasskey && (
        <button
          type="button"
          className="au-btn au-btn--ghost"
          onClick={handlePasskey}
          disabled={pending}
        >
          Unlock with passkey
        </button>
      )}

      <p className="text-sm text-[color:var(--txt-faint)]">
        <button
          type="button"
          className="au-link cursor-pointer bg-transparent border-0 p-0 text-sm"
          onClick={toggleMode}
          disabled={pending}
        >
          {isPassphrase ? copy.switchToRecovery : copy.switchToPassphrase}
        </button>
      </p>
    </div>
  );
}

export function UnlockScreen() {
  return (
    <main className={`au ${display.variable} ${mono.variable}`}>
      {/* atmosphere — emerald glow bleeding in from the brand side */}
      <span
        className="au-glow"
        style={{ width: 560, height: 560, top: -180, left: '-6%' }}
        aria-hidden
      />
      <span
        className="au-glow"
        style={{
          width: 420,
          height: 420,
          bottom: -200,
          left: '20%',
          opacity: 0.3,
        }}
        aria-hidden
      />

      <div className="au-layer grid min-h-svh grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <CryptoBrandPanel />

        {/* form side */}
        <div className="flex min-w-0 flex-col px-6 py-8 sm:px-10 lg:px-14">
          {/* compact wordmark — only visible on mobile (brand panel hidden) */}
          <Link
            href="/"
            className="au-rise flex items-center gap-2.5 lg:invisible"
            style={{ ['--d' as string]: '0.05s' }}
            aria-label={`${APP_NAME} home`}
          >
            <span className="au-mark ff-mono text-sm">L</span>
            <span className="text-[0.95rem] font-semibold tracking-tight">
              {APP_NAME}
            </span>
          </Link>

          <div className="flex flex-1 items-center justify-center py-10">
            <div
              className="au-rise w-full max-w-sm"
              style={{ ['--d' as string]: '0.18s' }}
            >
              <UnlockForm />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
