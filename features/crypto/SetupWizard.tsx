'use client';

import {
  KeyRound,
  Copy,
  Download,
  CheckCircle2,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { type FormEvent, useState, useRef } from 'react';
import '@/features/auth/auth.css';
import { finalizeEncryption } from '@/features/crypto/actions/finalizeEncryption';
import { setupCrypto } from '@/features/crypto/actions/setupCrypto';
import { CRYPTO_COPY } from '@/features/crypto/cryptoCopy';
import {
  generateDek,
  derivePassphraseKek,
  wrapDek,
  recoveryHkdfKey,
  generateRecoveryCode,
  toBase64,
} from '@/features/crypto/lib/clientCrypto';
import { postDek } from '@/features/crypto/lib/unlockFlow';
import { APP_NAME } from '@/lib/app';
import { Fraunces, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';

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

const ARGON = { m: 65536, t: 3, p: 1 } as const;

// Fixed setup orchestration — runs exactly once on advancing from step 2 → 3.
// Generates DEK client-side, derives both wrapping keys, posts to server,
// unlocks the session, and returns the one-time recovery code.
async function runSetup(passphrase: string): Promise<string> {
  const dek = generateDek();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { code, bytes } = generateRecoveryCode();
  const wrapPassphrase = await wrapDek(
    dek,
    await derivePassphraseKek(passphrase, salt, ARGON)
  );
  const wrapRecovery = await wrapDek(dek, await recoveryHkdfKey(bytes));
  const res = await setupCrypto({
    wrapPassphrase,
    passSalt: toBase64(salt),
    argonParams: ARGON,
    wrapRecovery,
  });
  if (!res.ok) throw new Error(res.error);
  await postDek(dek); // unlock this session so migration can run
  return code;
}

type Step = 'why' | 'passphrase' | 'recovery' | 'encrypting';

// ── decorative bars (echoes CryptoBrandPanel in UnlockScreen) ──
const LOCK_TICKS = [14, 22, 18, 28, 20, 32, 16, 26, 24, 30] as const;

function SetupBrandPanel() {
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

      {/* editorial centre */}
      <div className="relative z-10 max-w-md space-y-8">
        <span
          className="au-rise au-chip ff-mono"
          style={{ ['--d' as string]: '0.12s' }}
        >
          <span className="au-chip__dot" />
          SETUP ENCRYPTION
        </span>

        <h2
          className="au-rise ff-display text-[clamp(2.25rem,3.4vw,3.25rem)] leading-[1.04]"
          style={{ ['--d' as string]: '0.2s' }}
        >
          Keep your finances private. Always.
        </h2>

        {/* mock terminal card */}
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
              ; encrypting with AES-256-GCM
            </p>
            <p className="mt-1 text-[color:var(--gold)]">2026/06/25</p>
            <p className="mt-0.5 text-[color:var(--txt-dim)]">
              {'  '}Assets:Checking
              {'   '}
              <span className="text-[color:var(--em)]">$ 4,800.00</span>
            </p>
            <p className="mt-0.5 text-[color:var(--txt-dim)]">
              {'  '}Income:Salary
            </p>
          </div>
        </div>

        {/* decorative bars */}
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

      {/* feature ticks */}
      <ul
        className="au-rise relative z-10 space-y-2.5"
        style={{ ['--d' as string]: '0.46s' }}
      >
        {(
          [
            'Client-side key generation',
            'Zero-knowledge server',
            'Passphrase + recovery code',
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

// ── Step indicator ──────────────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  why: 'Why',
  passphrase: 'Passphrase',
  recovery: 'Recovery code',
  encrypting: 'Encrypting',
};
const STEP_ORDER: Step[] = ['why', 'passphrase', 'recovery', 'encrypting'];

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEP_ORDER.indexOf(current);
  return (
    <div className="flex items-center gap-1.5 mb-8" aria-label="Setup progress">
      {STEP_ORDER.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step} className="flex items-center gap-1.5">
            <div
              className="flex items-center justify-center rounded-full transition-all duration-300"
              style={{
                width: '1.4rem',
                height: '1.4rem',
                background: done
                  ? 'var(--em)'
                  : active
                    ? 'linear-gradient(180deg, var(--em), var(--em-deep))'
                    : 'var(--card)',
                border: active || done ? 'none' : '1px solid var(--line)',
                boxShadow: active
                  ? '0 0 0 3px oklch(78% 0.15 165 / 0.2)'
                  : 'none',
              }}
              aria-current={active ? 'step' : undefined}
            >
              {done ? (
                <CheckCircle2
                  className="size-3"
                  style={{ color: 'oklch(20% 0.04 165)' }}
                  aria-hidden
                />
              ) : (
                <span
                  className="ff-mono text-[0.6rem] font-bold"
                  style={{
                    color: active ? 'oklch(20% 0.04 165)' : 'var(--txt-faint)',
                  }}
                >
                  {i + 1}
                </span>
              )}
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div
                style={{
                  width: '1.5rem',
                  height: '1px',
                  background: done ? 'var(--em)' : 'var(--line)',
                  transition: 'background 0.3s ease',
                }}
              />
            )}
          </div>
        );
      })}
      <span className="ml-2 text-xs text-[color:var(--txt-faint)] ff-mono">
        {STEP_LABELS[current]}
      </span>
    </div>
  );
}

// ── Step 1: Why ─────────────────────────────────────────────────────────────

function WhyStep({ onNext }: { onNext: () => void }) {
  const copy = CRYPTO_COPY.explainer;
  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <h1 className="au-grad ff-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.05]">
          {copy.heading}
        </h1>
        <p className="text-[0.95rem] text-[color:var(--txt-dim)] leading-relaxed">
          {copy.body}
        </p>
      </div>

      <div className="au-card p-5 space-y-3">
        {[
          'Your DEK is generated in your browser — never sent to the server.',
          'We store only the encrypted wrapped key, not your passphrase.',
          'Recovery code is shown exactly once; save it before continuing.',
        ].map((point) => (
          <div key={point} className="flex items-start gap-3">
            <span
              className="mt-0.5 size-4 flex-none rounded-full flex items-center justify-center"
              style={{
                background: 'oklch(78% 0.15 165 / 0.15)',
                border: '1px solid oklch(78% 0.15 165 / 0.3)',
              }}
            >
              <span
                className="block rounded-full"
                style={{
                  width: '0.35rem',
                  height: '0.35rem',
                  background: 'var(--em)',
                }}
              />
            </span>
            <p className="text-sm text-[color:var(--txt-dim)] leading-relaxed">
              {point}
            </p>
          </div>
        ))}
      </div>

      <button type="button" className="au-btn au-btn--primary" onClick={onNext}>
        Get started
      </button>
    </div>
  );
}

// ── Step 2: Passphrase ───────────────────────────────────────────────────────

function strengthLabel(pass: string): { label: string; color: string } | null {
  if (!pass) return null;
  const len = pass.length;
  const wordCount = pass.trim().split(/\s+/).filter(Boolean).length;
  if (len < 8) return { label: 'Too short', color: 'oklch(72% 0.17 25)' };
  if (len < 12 && wordCount < 3)
    return { label: 'Weak', color: 'oklch(82% 0.14 55)' };
  if (len < 16 && wordCount < 4) return { label: 'Fair', color: 'var(--gold)' };
  if (len >= 16 || wordCount >= 4)
    return { label: 'Strong', color: 'var(--em)' };
  return null;
}

function PassphraseStep({
  onNext,
}: {
  onNext: (pass: string) => Promise<void>;
}) {
  const copy = CRYPTO_COPY.passphrase;
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const strength = strengthLabel(pass);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (pass.length < 8) {
      setError('Passphrase must be at least 8 characters.');
      return;
    }
    if (pass !== confirm) {
      setError('Passphrases do not match.');
      return;
    }
    setPending(true);
    try {
      await onNext(pass);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : CRYPTO_COPY.errors.setupFailed
      );
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <h1 className="au-grad ff-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.05]">
          {copy.heading}
        </h1>
        <p className="text-[0.95rem] text-[color:var(--txt-dim)]">
          {copy.helper}
        </p>
      </div>

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <div>
          <label className="au-label" htmlFor="setup-pass">
            {copy.label}
          </label>
          <input
            id="setup-pass"
            className="au-input"
            type="password"
            required
            autoComplete="new-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Enter a strong passphrase"
            disabled={pending}
            autoFocus
          />
          {/* strength hint */}
          {strength && (
            <div className="mt-2 flex items-center gap-2">
              <div
                className="h-1 flex-1 rounded-full overflow-hidden"
                style={{ background: 'var(--line)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width:
                      strength.label === 'Too short'
                        ? '20%'
                        : strength.label === 'Weak'
                          ? '40%'
                          : strength.label === 'Fair'
                            ? '65%'
                            : '100%',
                    background: strength.color,
                  }}
                />
              </div>
              <span
                className="text-xs ff-mono"
                style={{ color: strength.color, minWidth: '4rem' }}
              >
                {strength.label}
              </span>
            </div>
          )}
          <p className="mt-1.5 text-xs text-[color:var(--txt-faint)]">
            {copy.strengthHint}
          </p>
        </div>

        <div>
          <label className="au-label" htmlFor="setup-confirm">
            {copy.confirmLabel}
          </label>
          <input
            id="setup-confirm"
            className="au-input"
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm passphrase"
            disabled={pending}
          />
          {confirm && pass !== confirm && (
            <p
              className="mt-1.5 text-xs"
              style={{ color: 'oklch(72% 0.17 25)' }}
            >
              Passphrases do not match.
            </p>
          )}
        </div>

        <button
          type="submit"
          className="au-btn au-btn--primary"
          disabled={pending || !pass || !confirm}
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Setting up…
            </>
          ) : (
            copy.submitLabel
          )}
        </button>

        <p className="au-error" aria-live="polite" aria-atomic="true">
          {error ?? ''}
        </p>
      </form>
    </div>
  );
}

// ── Step 3: Recovery code ────────────────────────────────────────────────────

function RecoveryStep({ code, onNext }: { code: string; onNext: () => void }) {
  const copy = CRYPTO_COPY.recovery;
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Format code into groups of 4 separated by dashes
  const groups = code.split('-');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (copyTimeout.current) clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore clipboard errors — user can still copy manually
    }
  }

  function handleDownload() {
    const blob = new Blob(
      [
        `${APP_NAME} Recovery Code\n`,
        `Generated: ${new Date().toISOString()}\n\n`,
        code,
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
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="space-y-2">
        <h1 className="au-grad ff-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.05]">
          {copy.heading}
        </h1>
        <p className="text-[0.95rem] text-[color:var(--txt-dim)]">
          {copy.warning}
        </p>
      </div>

      {/* recovery code display */}
      <div
        className="au-card p-5 space-y-4"
        role="region"
        aria-label="Recovery code"
      >
        <div className="flex flex-wrap gap-2 justify-center py-1">
          {groups.map((group, i) => (
            <span
              key={i}
              className="ff-mono select-all"
              style={{
                fontSize: '1.05rem',
                letterSpacing: '0.12em',
                color: 'var(--em)',
                background: 'oklch(78% 0.15 165 / 0.08)',
                border: '1px solid oklch(78% 0.15 165 / 0.2)',
                borderRadius: '0.5rem',
                padding: '0.35rem 0.6rem',
                fontWeight: 600,
              }}
            >
              {group}
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            className="au-btn au-btn--ghost flex-1"
            style={{ height: '2.5rem', fontSize: '0.85rem' }}
            onClick={handleCopy}
            aria-label="Copy recovery code to clipboard"
          >
            <Copy className="size-3.5" aria-hidden />
            {copied ? copy.copiedLabel : copy.copyLabel}
          </button>
          <button
            type="button"
            className="au-btn au-btn--ghost flex-1"
            style={{ height: '2.5rem', fontSize: '0.85rem' }}
            onClick={handleDownload}
            aria-label="Download recovery code as text file"
          >
            <Download className="size-3.5" aria-hidden />
            Download
          </button>
        </div>
      </div>

      <p className="text-sm text-[color:var(--txt-faint)] leading-relaxed">
        {copy.instruction}
      </p>

      {/* "I've saved it" gate */}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5 size-4 cursor-pointer accent-[var(--em)]"
          aria-label={copy.confirmPrompt}
        />
        <span className="text-sm text-[color:var(--txt-dim)] select-none">
          {copy.confirmPrompt}
        </span>
      </label>

      <button
        type="button"
        className="au-btn au-btn--primary"
        disabled={!saved}
        onClick={onNext}
      >
        {copy.submitLabel}
      </button>
    </div>
  );
}

// ── Step 4: Encrypting ───────────────────────────────────────────────────────

function EncryptingStep() {
  const copy = CRYPTO_COPY.encrypting;
  return (
    <div className="flex flex-col items-center gap-8 py-4 text-center">
      {/* animated shield */}
      <div
        className="au-icon-tile"
        style={{
          width: '4rem',
          height: '4rem',
          borderRadius: '1.2rem',
          boxShadow: '0 0 0 8px oklch(78% 0.15 165 / 0.1)',
        }}
      >
        <Loader2
          className="size-7 animate-spin text-[color:var(--em)]"
          aria-hidden
        />
      </div>

      <div className="space-y-2">
        <h1
          className="ff-display text-[clamp(1.75rem,3.5vw,2.4rem)] leading-[1.1]"
          style={{ color: 'var(--txt)' }}
        >
          {copy.heading}
        </h1>
        <p className="text-[0.95rem] text-[color:var(--txt-dim)]">
          {copy.body}
        </p>
      </div>

      {/* decorative progress bars */}
      <div className="w-full space-y-2.5 max-w-xs">
        {[
          { label: 'Wrapping keys', done: true },
          { label: 'Encrypting journal', done: false },
        ].map(({ label, done }) => (
          <div key={label} className="space-y-1">
            <div className="flex justify-between text-xs text-[color:var(--txt-faint)] ff-mono">
              <span>{label}</span>
              {done && <span style={{ color: 'var(--em)' }}>✓</span>}
            </div>
            <div
              className="h-1 rounded-full overflow-hidden"
              style={{ background: 'var(--line)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: done ? '100%' : '45%',
                  background: done ? 'var(--em)' : 'var(--gold)',
                  animation: done
                    ? undefined
                    : 'auEncryptPulse 1.8s ease-in-out infinite',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes auEncryptPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// ── Root wizard ──────────────────────────────────────────────────────────────

export function SetupWizard() {
  const [step, setStep] = useState<Step>('why');
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [fatalRetryStep, setFatalRetryStep] = useState<Step>('passphrase');

  // Advance from passphrase → recovery: runs the full orchestration.
  async function handlePassphraseNext(passphrase: string) {
    try {
      const code = await runSetup(passphrase);
      setRecoveryCode(code);
      setStep('recovery');
    } catch (err) {
      setFatalRetryStep('passphrase');
      setFatalError(
        err instanceof Error ? err.message : CRYPTO_COPY.errors.setupFailed
      );
    }
  }

  // Advance from recovery → encrypting: kick off finalization.
  async function handleRecoveryNext() {
    setStep('encrypting');
    try {
      const result = await finalizeEncryption();
      if (!result.ok) {
        setFatalRetryStep('recovery');
        setFatalError(result.error ?? CRYPTO_COPY.errors.setupFailed);
        return;
      }
      // Hard navigate so the session gate sees `ready`.
      window.location.assign('/dashboard');
    } catch (err) {
      setFatalRetryStep('recovery');
      setFatalError(
        err instanceof Error ? err.message : CRYPTO_COPY.errors.generic
      );
    }
  }

  return (
    <main className={`au ${display.variable} ${mono.variable}`}>
      {/* atmosphere glows */}
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
        <SetupBrandPanel />

        {/* form side */}
        <div className="flex min-w-0 flex-col px-6 py-8 sm:px-10 lg:px-14">
          {/* compact wordmark — only visible on mobile */}
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
              <StepIndicator current={step} />

              {fatalError ? (
                <div className="flex flex-col gap-4">
                  <p className="au-error">{fatalError}</p>
                  <button
                    type="button"
                    className="au-btn au-btn--ghost"
                    onClick={() => {
                      setFatalError(null);
                      setStep(fatalRetryStep);
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : step === 'why' ? (
                <WhyStep onNext={() => setStep('passphrase')} />
              ) : step === 'passphrase' ? (
                <PassphraseStep onNext={handlePassphraseNext} />
              ) : step === 'recovery' && recoveryCode ? (
                <RecoveryStep code={recoveryCode} onNext={handleRecoveryNext} />
              ) : step === 'encrypting' ? (
                <EncryptingStep />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
