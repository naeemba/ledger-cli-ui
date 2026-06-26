# Wizard recovery-gate hardening + inline passkey step — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Force recovery-code saving in the encryption wizard, and add an optional wizard step that registers/enrolls a passkey for unlock inline.

**Architecture:** Two new client helpers in `features/crypto/lib/passkeyFlow.ts` (`registerPasskey`, `enrollPasskeyForUnlock`) carry the logic and get full unit tests. A new `PasskeyStep` component (its own file, au-* styled) consumes them and is wired into `SetupWizard.tsx` as a new step between `recovery` and `encrypting`; the `postDek`+`finalizeEncryption` call moves from the recovery handler to the new passkey handler. The recovery gate is hardened in place. Passkey enrollment is additive — the DEK never changes — and the step is always skippable.

**Tech Stack:** Next.js 16, React client components, TypeScript, Vitest (`environment: 'node'`, `renderToStaticMarkup` for component tests), better-auth passkey client (`authClient.passkey.addPasskey`), WebAuthn PRF + AES-GCM (existing `clientCrypto`/`webauthn` libs).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-26-wizard-recovery-gate-and-passkey-step-design.md`.
- **DEK never changes:** passkey enrollment is an additional wrap of the same DEK; do not regenerate or re-wrap the DEK, do not re-encrypt the journal.
- **Passkey step is optional:** the user can always Skip; never block onboarding on it.
- **Enroll requires only the userCrypto row + auth, not an unlocked session** — `enablePasskeyUnlockAction` checks `getUserCryptoRepository().exists(user.id)` (`features/crypto/actions/enablePasskeyUnlock.ts:22-23`). The row exists from the passphrase step's `runSetup`. So enrollment happens *before* `postDek`/finalize.
- **PRF at registration is server-configured:** `lib/auth.ts` sets `passkey.registration.extensions.prf = {}` (needs `@naeemba/next-starter` `^0.9.0`, already installed). Any passkey created via `addPasskey` is therefore PRF-capable. Do NOT pass PRF extensions from the client `addPasskey` call.
- **Styling:** wizard components use the `au-*` editorial classes (`au-card`, `au-btn`, `au-btn--primary`, `au-btn--ghost`, `au-error`) from `features/auth/auth.css` — NOT shadcn. Match the existing steps in `SetupWizard.tsx`.
- **Copy lives in `features/crypto/cryptoCopy.ts`** — no inline user-facing strings in components.
- **Gate every task** with: `pnpm type-check`, `pnpm lint`, `pnpm test` (all must pass). The pre-commit husky hook runs type-check + lint-staged; commits fail if type-check fails.

---

### Task 1: Harden the recovery-code gate

Require the user to click **Copy** or **Download** at least once *and* tick the checkbox before "Enable encryption" is enabled. Interactive gating is verified manually (the component imports server actions, so it is not import-testable; this matches the repo's approach — only leaf components like `features/auth/BrandPanel.tsx` get `renderToStaticMarkup` tests).

**Files:**
- Modify: `features/crypto/cryptoCopy.ts` (add `recovery.saveFirstHint`)
- Modify: `features/crypto/SetupWizard.tsx` (the `RecoveryStep` function, ~lines 460-590)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing other tasks rely on (self-contained UI change).

- [ ] **Step 1: Add the hint copy string**

In `features/crypto/cryptoCopy.ts`, inside the `recovery: { … }` block, add `saveFirstHint` (place it after `confirmPrompt`):

```ts
  recovery: {
    heading: 'Save your recovery code',
    label: 'Recovery code',
    warning:
      'This code is shown once. Write it down or store it in a password manager — you cannot retrieve it later.',
    instruction:
      'If you forget your passphrase, this code is the only way to regain access to your journal.',
    copyLabel: 'Copy code',
    copiedLabel: 'Copied!',
    confirmPrompt: 'I have saved my recovery code',
    saveFirstHint: 'Copy or download your code first.',
    submitLabel: 'Enable encryption',
  },
```

- [ ] **Step 2: Add the `interacted` state and set it on copy/download**

In `features/crypto/SetupWizard.tsx`, in `RecoveryStep`, add the state next to the existing `copied`/`saved` state (~line 462):

```tsx
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [interacted, setInteracted] = useState(false);
```

Set `interacted` at the start of `handleCopy` and `handleDownload` (a click counts even if the clipboard API fails — the code is visible on screen). In `handleCopy`, add `setInteracted(true);` as the first line of the function body; in `handleDownload`, add `setInteracted(true);` as the first line:

```tsx
  async function handleCopy() {
    setInteracted(true);
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
    setInteracted(true);
    const blob = new Blob(
```

- [ ] **Step 3: Disable the checkbox until interacted, the button until interacted+saved, and show the hint**

In the `RecoveryStep` JSX, update the checkbox `<input>` to add `disabled={!interacted}` (~line 568):

```tsx
        <input
          type="checkbox"
          checked={saved}
          disabled={!interacted}
          onChange={(e) => setSaved(e.target.checked)}
          className="mt-0.5 size-4 cursor-pointer accent-[var(--em)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={copy.confirmPrompt}
        />
```

Add the hint immediately *after* the Copy/Download button group `</div>` (the `<div className="flex gap-2">…</div>` block ends ~line 559) and before the `<p>{copy.instruction}</p>`:

```tsx
        {!interacted && (
          <p className="text-xs text-[color:var(--txt-faint)] text-center">
            {copy.saveFirstHint}
          </p>
        )}
```

Update the "Enable encryption" button's `disabled` (~line 583) from `disabled={!saved}` to:

```tsx
      <button
        type="button"
        className="au-btn au-btn--primary"
        disabled={!interacted || !saved}
        onClick={onNext}
      >
        {copy.submitLabel}
      </button>
```

- [ ] **Step 4: Verify type-check and lint pass**

Run: `pnpm type-check && pnpm lint`
Expected: both exit 0, no errors.

- [ ] **Step 5: Manual verification (needs a logged-in session at `/crypto/setup`)**

Run the app (`pnpm dev`), sign in as a fresh user, start encryption setup, reach the recovery step. Confirm:
- The "I have saved my recovery code" checkbox is **disabled** and the hint "Copy or download your code first." is shown on arrival.
- After clicking **Copy** (or **Download**), the hint disappears and the checkbox becomes tickable.
- "Enable encryption" stays disabled until the box is both interactable and ticked.

(If no Postgres/Garage dev env is available, defer this to the live-acceptance pass and note it; the automated gate in Step 4 still applies.)

- [ ] **Step 6: Commit**

```bash
git add features/crypto/cryptoCopy.ts features/crypto/SetupWizard.tsx
git commit -m "feat(crypto): require copy/download before confirming recovery code"
```

---

### Task 2: `registerPasskey` helper

Register a new PRF-capable passkey via better-auth and resolve its `credentialId`.

**Files:**
- Modify: `features/crypto/lib/passkeyFlow.ts`
- Test: `features/crypto/lib/passkeyFlow.test.ts`

**Interfaces:**
- Consumes: `authClient` from `@/lib/auth-client` (`authClient.passkey.addPasskey({ name }) → Promise<{ data: Passkey | null; error: {...} | null; … }>`, where `Passkey.credentialID: string`).
- Produces: `registerPasskey(name: string): Promise<{ credentialId: string }>` — used by Task 4.

- [ ] **Step 1: Write the failing test**

Add to `features/crypto/lib/passkeyFlow.test.ts`. At the top, add the auth-client mock alongside the existing `vi.mock` calls, and import the new function + `authClient`:

```ts
import { authClient } from '@/lib/auth-client';
import { buildPasskeyWrap, unlockWithPasskey, registerPasskey } from './passkeyFlow';
// …existing imports…

vi.mock('@/lib/auth-client', () => ({
  authClient: { passkey: { addPasskey: vi.fn() } },
}));
```

Add the describe block:

```ts
describe('registerPasskey', () => {
  it('returns the new credentialId on success', async () => {
    (
      authClient.passkey.addPasskey as MockedFunction<
        typeof authClient.passkey.addPasskey
      >
    ).mockResolvedValue({ data: { credentialID: 'cred-new' }, error: null } as never);
    const out = await registerPasskey('This device');
    expect(out.credentialId).toBe('cred-new');
    expect(authClient.passkey.addPasskey).toHaveBeenCalledWith({
      name: 'This device',
    });
  });

  it('throws with the server message when registration errors', async () => {
    (
      authClient.passkey.addPasskey as MockedFunction<
        typeof authClient.passkey.addPasskey
      >
    ).mockResolvedValue({ data: null, error: { message: 'denied' } } as never);
    await expect(registerPasskey('x')).rejects.toThrow('denied');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- features/crypto/lib/passkeyFlow.test.ts`
Expected: FAIL — `registerPasskey is not a function` (or import error).

- [ ] **Step 3: Implement `registerPasskey`**

In `features/crypto/lib/passkeyFlow.ts`, add the import and the function:

```ts
import { authClient } from '@/lib/auth-client';
```

```ts
/**
 * Register a new passkey via better-auth and resolve its credentialId. PRF is
 * requested at registration by the server config (lib/auth.ts:
 * passkey.registration.extensions.prf = {}), so the created credential supports
 * PRF — no client-side extension needed here. Throws if the user cancels or the
 * server rejects.
 */
export const registerPasskey = async (
  name: string
): Promise<{ credentialId: string }> => {
  const res = await authClient.passkey.addPasskey({ name });
  if (!res || res.error || !res.data) {
    throw new Error(res?.error?.message ?? 'Could not create a passkey.');
  }
  return { credentialId: res.data.credentialID };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- features/crypto/lib/passkeyFlow.test.ts`
Expected: PASS (both new cases + existing `buildPasskeyWrap`/`unlockWithPasskey` cases).

- [ ] **Step 5: Commit**

```bash
git add features/crypto/lib/passkeyFlow.ts features/crypto/lib/passkeyFlow.test.ts
git commit -m "feat(crypto): registerPasskey helper for inline passkey creation"
```

---

### Task 3: `enrollPasskeyForUnlock` helper

Wrap the DEK for a given passkey and persist the wrap — `buildPasskeyWrap` + `enablePasskeyUnlockAction` in one call.

**Files:**
- Modify: `features/crypto/lib/passkeyFlow.ts`
- Test: `features/crypto/lib/passkeyFlow.test.ts`

**Interfaces:**
- Consumes: existing `buildPasskeyWrap(dek, credentialId, label)`; `enablePasskeyUnlockAction(input) → Promise<{ ok: true } | { ok: false; message: string }>` from `@/features/crypto/actions/enablePasskeyUnlock`.
- Produces: `enrollPasskeyForUnlock(dek: Uint8Array, credentialId: string, label: string): Promise<void>` — used by Task 4.

- [ ] **Step 1: Write the failing test**

Add to `features/crypto/lib/passkeyFlow.test.ts`. Add the action mock and import:

```ts
import { enablePasskeyUnlockAction } from '@/features/crypto/actions/enablePasskeyUnlock';
import { buildPasskeyWrap, unlockWithPasskey, registerPasskey, enrollPasskeyForUnlock } from './passkeyFlow';

vi.mock('@/features/crypto/actions/enablePasskeyUnlock');
```

Add the describe block (`assertPrfForCredential` is already mocked via the existing `vi.mock('./webauthn')`; `wrapDek`/`derivePrfKek` run for real, as in the `buildPasskeyWrap` test):

```ts
describe('enrollPasskeyForUnlock', () => {
  it('builds a wrap and enables it', async () => {
    (
      assertPrfForCredential as MockedFunction<typeof assertPrfForCredential>
    ).mockResolvedValue({ credentialId: 'cred-A', prfOutput: new Uint8Array(32).fill(7) });
    (
      enablePasskeyUnlockAction as MockedFunction<typeof enablePasskeyUnlockAction>
    ).mockResolvedValue({ ok: true });

    await enrollPasskeyForUnlock(generateDek(), 'cred-A', 'Laptop');

    expect(enablePasskeyUnlockAction).toHaveBeenCalledTimes(1);
    const arg = (
      enablePasskeyUnlockAction as MockedFunction<typeof enablePasskeyUnlockAction>
    ).mock.calls[0][0] as { credentialId: string; label: string };
    expect(arg.credentialId).toBe('cred-A');
    expect(arg.label).toBe('Laptop');
  });

  it('throws with the action message when enabling fails', async () => {
    (
      assertPrfForCredential as MockedFunction<typeof assertPrfForCredential>
    ).mockResolvedValue({ credentialId: 'cred-A', prfOutput: new Uint8Array(32).fill(7) });
    (
      enablePasskeyUnlockAction as MockedFunction<typeof enablePasskeyUnlockAction>
    ).mockResolvedValue({ ok: false, message: 'rate limited' });

    await expect(
      enrollPasskeyForUnlock(generateDek(), 'cred-A', 'L')
    ).rejects.toThrow('rate limited');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- features/crypto/lib/passkeyFlow.test.ts`
Expected: FAIL — `enrollPasskeyForUnlock is not a function`.

- [ ] **Step 3: Implement `enrollPasskeyForUnlock`**

In `features/crypto/lib/passkeyFlow.ts`, add the import and function:

```ts
import { enablePasskeyUnlockAction } from '@/features/crypto/actions/enablePasskeyUnlock';
```

```ts
/**
 * Enroll a passkey for unlock: wrap the DEK with the passkey's PRF-derived KEK
 * and persist the wrap. The caller already holds the DEK (wizard: in-memory;
 * settings: obtained via an authorizer). Throws if the PRF assertion or the
 * server action fails.
 */
export const enrollPasskeyForUnlock = async (
  dek: Uint8Array,
  credentialId: string,
  label: string
): Promise<void> => {
  const input = await buildPasskeyWrap(dek, credentialId, label);
  const res = await enablePasskeyUnlockAction(input);
  if (!res.ok) throw new Error(res.message);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- features/crypto/lib/passkeyFlow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/crypto/lib/passkeyFlow.ts features/crypto/lib/passkeyFlow.test.ts
git commit -m "feat(crypto): enrollPasskeyForUnlock helper (wrap DEK + persist)"
```

---

### Task 4: Passkey wizard step + flow rewiring

Add the `passkey` step component and insert it into the wizard between `recovery` and `encrypting`, moving the finalize call to the new step.

**Files:**
- Modify: `features/crypto/cryptoCopy.ts` (add the `passkey` copy block)
- Create: `features/crypto/PasskeyStep.tsx`
- Create: `features/crypto/PasskeyStep.test.tsx`
- Modify: `features/crypto/SetupWizard.tsx` (Step type/labels/order; `handleRecoveryNext`; new `handlePasskeyNext`; render branch; brand-panel tick)

**Interfaces:**
- Consumes: `registerPasskey` (Task 2), `enrollPasskeyForUnlock` (Task 3), `CRYPTO_COPY.passkey`.
- Produces: `PasskeyStep({ dek: Uint8Array; onNext: () => void })` (named export) — consumed by `SetupWizard`.

- [ ] **Step 1: Add the passkey copy block**

In `features/crypto/cryptoCopy.ts`, add a `passkey` block after the `recovery` block:

```ts
  // ── Passkey step (optional) ─────────────────────────────────────────────────
  passkey: {
    heading: 'Add a passkey',
    body: 'Optionally let this device unlock your journal with a passkey, alongside your passphrase and recovery code. You can add more later in Settings.',
    twiceNote:
      "You'll be asked to confirm twice — once to create the passkey, once to link it.",
    addLabel: 'Add this device',
    addingLabel: 'Adding…',
    enableLabel: 'Enable unlock',
    enablingLabel: 'Enabling…',
    enrolledLabel: 'Enabled',
    skipLabel: 'Skip for now',
    continueLabel: 'Continue',
    errors: {
      registerFailed: 'Could not create a passkey. Please try again.',
      enrollFailed: 'Could not link the passkey. Please try again.',
    },
  },
```

- [ ] **Step 2: Write the failing component test**

Create `features/crypto/PasskeyStep.test.tsx`:

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

// Mock the flow module so the test never pulls in the server action transitively.
vi.mock('./lib/passkeyFlow', () => ({
  registerPasskey: vi.fn(),
  enrollPasskeyForUnlock: vi.fn(),
}));

import { PasskeyStep } from './PasskeyStep';

describe('PasskeyStep', () => {
  it('renders the add-device and skip controls', () => {
    const out = renderToStaticMarkup(
      <PasskeyStep dek={new Uint8Array(32)} onNext={() => {}} />
    );
    expect(out).toContain('Add this device');
    expect(out).toContain('Skip for now');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test -- features/crypto/PasskeyStep.test.tsx`
Expected: FAIL — cannot find module `./PasskeyStep`.

- [ ] **Step 4: Implement `PasskeyStep`**

Create `features/crypto/PasskeyStep.tsx`:

```tsx
'use client';

import { CheckCircle2, KeyRound, Loader2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CRYPTO_COPY } from './cryptoCopy';
import { enrollPasskeyForUnlock, registerPasskey } from './lib/passkeyFlow';

type Row = { credentialId: string; name: string; enabled: boolean };

const ADD = '__add__';

async function fetchPasskeys(): Promise<
  { credentialID: string; name?: string }[]
> {
  try {
    const res = await fetch('/api/auth/passkey/list-user-passkeys', {
      method: 'GET',
      credentials: 'include',
    });
    if (!res.ok) return [];
    return (await res.json()) as { credentialID: string; name?: string }[];
  } catch {
    return [];
  }
}

export function PasskeyStep({
  dek,
  onNext,
}: {
  dek: Uint8Array;
  onNext: () => void;
}) {
  const copy = CRYPTO_COPY.passkey;
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrolledCount, setEnrolledCount] = useState(0);

  useEffect(() => {
    void (async () => {
      const passkeys = await fetchPasskeys();
      setRows(
        passkeys.map((p) => ({
          credentialId: p.credentialID,
          name: p.name ?? 'Passkey',
          enabled: false,
        }))
      );
    })();
  }, []);

  async function handleAdd() {
    setError(null);
    setBusy(ADD);
    try {
      const { credentialId } = await registerPasskey('This device');
      await enrollPasskeyForUnlock(dek, credentialId, 'This device');
      setRows((r) => [
        ...r.filter((x) => x.credentialId !== credentialId),
        { credentialId, name: 'This device', enabled: true },
      ]);
      setEnrolledCount((c) => c + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : copy.errors.registerFailed
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleEnable(row: Row) {
    setError(null);
    setBusy(row.credentialId);
    try {
      await enrollPasskeyForUnlock(dek, row.credentialId, row.name);
      setRows((r) =>
        r.map((x) =>
          x.credentialId === row.credentialId ? { ...x, enabled: true } : x
        )
      );
      setEnrolledCount((c) => c + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errors.enrollFailed);
    } finally {
      setBusy(null);
    }
  }

  const unenrolled = rows.filter((r) => !r.enabled);
  const enrolled = rows.filter((r) => r.enabled);

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

      <div className="au-card p-5 flex flex-col gap-3">
        <button
          type="button"
          className="au-btn au-btn--ghost"
          onClick={handleAdd}
          disabled={busy !== null}
        >
          {busy === ADD ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {copy.addingLabel}
            </>
          ) : (
            <>
              <Plus className="size-4" aria-hidden />
              {copy.addLabel}
            </>
          )}
        </button>

        {unenrolled.map((row) => (
          <div
            key={row.credentialId}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] p-3"
          >
            <span className="flex items-center gap-2 text-sm text-[color:var(--txt-dim)]">
              <KeyRound className="size-4" aria-hidden />
              {row.name}
            </span>
            <button
              type="button"
              className="au-btn au-btn--ghost"
              style={{ height: '2.25rem', fontSize: '0.8rem' }}
              onClick={() => handleEnable(row)}
              disabled={busy !== null}
            >
              {busy === row.credentialId ? copy.enablingLabel : copy.enableLabel}
            </button>
          </div>
        ))}

        {enrolled.map((row) => (
          <div
            key={row.credentialId}
            className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] p-3"
          >
            <span className="flex items-center gap-2 text-sm text-[color:var(--txt-dim)]">
              <KeyRound className="size-4" aria-hidden />
              {row.name}
            </span>
            <span
              className="flex items-center gap-1.5 text-xs ff-mono"
              style={{ color: 'var(--em)' }}
            >
              <CheckCircle2 className="size-3.5" aria-hidden />
              {copy.enrolledLabel}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-[color:var(--txt-faint)] leading-relaxed">
        {copy.twiceNote}
      </p>

      <button
        type="button"
        className="au-btn au-btn--primary"
        onClick={onNext}
        disabled={busy !== null}
      >
        {enrolledCount > 0 ? copy.continueLabel : copy.skipLabel}
      </button>

      <p className="au-error" aria-live="polite" aria-atomic="true">
        {error ?? ''}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `pnpm test -- features/crypto/PasskeyStep.test.tsx`
Expected: PASS (`renderToStaticMarkup` does not run the `useEffect`, so no fetch fires; the add + skip controls render).

- [ ] **Step 6: Wire the step into `SetupWizard.tsx` — type, labels, order**

In `features/crypto/SetupWizard.tsx`:

Update the `Step` type (~line 69):

```tsx
type Step = 'why' | 'passphrase' | 'recovery' | 'passkey' | 'encrypting';
```

Update `STEP_LABELS` (~line 174) to add `passkey`:

```tsx
const STEP_LABELS: Record<Step, string> = {
  why: 'Why',
  passphrase: 'Passphrase',
  recovery: 'Recovery code',
  passkey: 'Passkey',
  encrypting: 'Encrypting',
};
const STEP_ORDER: Step[] = [
  'why',
  'passphrase',
  'recovery',
  'passkey',
  'encrypting',
];
```

Add the import near the other feature imports (~line 13):

```tsx
import { PasskeyStep } from '@/features/crypto/PasskeyStep';
```

- [ ] **Step 7: Move finalize from `handleRecoveryNext` to a new `handlePasskeyNext`**

In `features/crypto/SetupWizard.tsx`, replace the body of `handleRecoveryNext` (~lines 697-722) so it only advances to the passkey step, and add `handlePasskeyNext` with the finalize logic that used to live there:

```tsx
  // Advance from recovery → passkey. The DEK is already in dekRef and the
  // userCrypto row already exists, so the optional passkey step can enroll
  // before the session is unlocked at finalize.
  function handleRecoveryNext() {
    if (!dekRef.current) {
      // Lost the in-memory DEK (e.g. a reload) — the row already exists, so
      // route through the normal unlock flow instead.
      window.location.assign('/crypto/unlock');
      return;
    }
    setStep('passkey');
  }

  // Advance from passkey → encrypting: unlock the session, then finalize.
  // Both "Skip" and "Continue" call this; enrolling a passkey is additive and
  // already complete by this point. Idempotent and safe to re-run on "Retry".
  async function handlePasskeyNext() {
    const dek = dekRef.current;
    if (!dek) {
      window.location.assign('/crypto/unlock');
      return;
    }
    setStep('encrypting');
    try {
      await postDek(dek); // unlock this session so migration can run
      const result = await finalizeEncryption();
      if (!result.ok) {
        setFatalRetryStep('passkey');
        setFatalError(result.error ?? CRYPTO_COPY.errors.setupFailed);
        return;
      }
      // Hard navigate so the session gate sees `ready`.
      window.location.assign('/dashboard');
    } catch (err) {
      setFatalRetryStep('passkey');
      setFatalError(
        err instanceof Error ? err.message : CRYPTO_COPY.errors.generic
      );
    }
  }
```

Note: `handleRecoveryNext` is no longer `async`. Its `onNext` prop on `RecoveryStep` is typed `() => void`, so this is compatible.

- [ ] **Step 8: Render the passkey step in the wizard branch**

In the render branch (~lines 783-791), insert the `passkey` case between `recovery` and `encrypting`:

```tsx
              ) : step === 'recovery' && recoveryCode ? (
                <RecoveryStep code={recoveryCode} onNext={handleRecoveryNext} />
              ) : step === 'passkey' && dekRef.current ? (
                <PasskeyStep dek={dekRef.current} onNext={handlePasskeyNext} />
              ) : step === 'encrypting' ? (
                <EncryptingStep />
              ) : null}
```

- [ ] **Step 9: Update the brand-panel feature tick**

In `SetupBrandPanel` (~line 159), change the third feature tick to mention passkeys:

```tsx
            'Client-side key generation',
            'Zero-knowledge server',
            'Passphrase, recovery code & passkey',
```

- [ ] **Step 10: Verify the full automated gate**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all pass. (Type-check confirms the `Step` union, the non-async `handleRecoveryNext`, and the `PasskeyStep` props all line up.)

- [ ] **Step 11: Commit**

```bash
git add features/crypto/cryptoCopy.ts features/crypto/PasskeyStep.tsx features/crypto/PasskeyStep.test.tsx features/crypto/SetupWizard.tsx
git commit -m "feat(crypto): inline passkey step in the encryption setup wizard"
```

- [ ] **Step 12: Live manual acceptance (needs a real Postgres + Garage dev env)**

These confirm the WebAuthn/PRF path end-to-end and cannot run in CI. Defer to the project's live-acceptance pass if no dev env is available, and record the result:

1. Fresh magic-link user → wizard → after the recovery step, the **Passkey** step appears.
2. **Add this device** → Touch ID prompt (create), then a second prompt (PRF assert) → row shows **Enabled**; the "twice" note matches the real prompt count.
3. **Continue** → encrypting → dashboard; journal is ciphertext (`LEJ1`) at rest in Garage.
4. Lock, then unlock with the new passkey (Touch ID) → journal decrypts.
5. **Skip for now** path: onboarding still completes with passphrase + recovery only.
6. Existing-passkey user: the step lists the passkey with **Enable unlock**; enabling works.
7. A device/browser without PRF: **Add this device** surfaces a clear inline error and **Skip** still completes setup.

---

## Self-Review

**Spec coverage:**
- Recovery-gate hardening (copy/download + checkbox) → Task 1. ✓
- New `'passkey'` step + flow rewiring (`handleRecoveryNext`/`handlePasskeyNext`) → Task 4 (Steps 6-8). ✓
- `registerPasskey` / `enrollPasskeyForUnlock` helpers → Tasks 2, 3. ✓
- Register-new-inline + enroll-existing in the component → Task 4 `PasskeyStep` (`handleAdd` / `handleEnable`). ✓
- Reload guard routing to `/crypto/unlock` → Task 4 Step 7 (both handlers). ✓
- Copy additions (recovery hint + passkey block + brand tick) → Tasks 1, 4. ✓
- Edge cases (no PRF, dismiss, two prompts, register-ok/enroll-fail, rate limit) → handled by helper throws surfaced inline in `PasskeyStep`; verified in Task 4 Step 12. ✓
- Tests for the two helpers → Tasks 2, 3; light static test for the component → Task 4 Step 2. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are complete; manual steps have explicit instructions and an env caveat.

**Type consistency:** `registerPasskey → { credentialId }`, `enrollPasskeyForUnlock(dek, credentialId, label) → void`, `PasskeyStep({ dek, onNext })`, `Step` union includes `'passkey'`, `STEP_LABELS`/`STEP_ORDER` both updated, `handleRecoveryNext` made non-async (matches `RecoveryStep` `onNext: () => Promise<void>`? — `RecoveryStep`'s `onNext` is `() => void`; a non-async void function satisfies it). `Passkey.credentialID` (better-auth) maps to our `credentialId`. Consistent.
```
