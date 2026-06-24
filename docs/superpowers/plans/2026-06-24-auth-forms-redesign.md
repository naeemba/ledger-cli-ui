# Auth Forms Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal starter sign-in screen with a bespoke, studio-grade passwordless auth experience (split-editorial layout), add a matching sign-up screen, and open the app to multi-user self-registration.

**Architecture:** A new `features/auth/` module holds pure logic (copy, callback-URL safety, a method-status reducer, resend cooldown), pure presentational sub-components (tested via `renderToStaticMarkup`), and an interactive `AuthForm` container that wires them to `@/lib/auth-client`. Thin route shells in `app/sign-in` and `app/sign-up` render a shared `AuthScreen`. The starter package is untouched; we use its documented "blank canvas" path. Multi-user is enabled by removing the `singleAdmin` allowlist in `lib/auth.ts`.

**Tech Stack:** Next.js 16 (App Router), React 19, better-auth via `@naeemba/next-starter`, Tailwind v4 (oklch tokens), shadcn UI primitives (`components/ui`), lucide-react, Vitest (node env, no DOM).

## Global Constraints

- **No new test dependencies.** Test env is `node`. No jsdom / Testing Library. Test pure logic with plain Vitest; test rendered markup with `renderToStaticMarkup` from `react-dom/server` (see `utils/formatAmount.test.tsx` for the pattern).
- **Reuse existing primitives & tokens.** Use `components/ui` (`Button`, `Input`, `Label`, `Card`, `Separator`) and theme tokens. No hardcoded colors — must be dark-mode aware via tokens.
- **`cn` helper** lives at `@/lib/utils`.
- **Button variants available:** `default | outline | secondary | ghost | destructive | link`. Sizes include `default | sm | lg | icon` (use `default` unless noted).
- **Auth client:** import `{ signIn }` or `authClient` from `@/lib/auth-client`. Methods: `authClient.signIn.magicLink`, `.social`, `.passkey`.
- **Callback targets:** `callbackURL = '/dashboard'`, `errorCallbackURL = '/sign-in/error'`.
- **Google button** shows only when `process.env.NEXT_PUBLIC_ENABLE_GOOGLE === '1'`.
- **Required copy — spam warning** must appear in the magic-link "sent" state: "Don't see it? Check your spam or junk folder — and add our address to your contacts."
- **Brand copy:** tagline `Track every cent. Plain text. Yours.`; feature ticks `Double-entry`, `CLI-powered`, `Self-hosted`.
- **App name:** import `APP_NAME` from `@/lib/app` (do not hardcode "Ledger").
- **Commit style:** Conventional Commits; repo runs lint-staged + `type-check` on commit. End commit messages with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **Run after each task:** `pnpm test` (relevant file), `pnpm type-check`, `pnpm lint`.

---

### Task 1: Callback-URL safety helpers (pure)

**Files:**
- Create: `features/auth/callbackUrl.ts`
- Test: `features/auth/callbackUrl.test.ts`

**Interfaces:**
- Produces:
  - `isSafeSameOriginCallbackUrl(value: string): boolean`
  - `resolveCallbackUrl(callbackParam: string, propValue: string | undefined): string`

- [ ] **Step 1: Write the failing test**

```ts
// features/auth/callbackUrl.test.ts
import { describe, it, expect } from 'vitest';
import { isSafeSameOriginCallbackUrl } from './callbackUrl';

describe('isSafeSameOriginCallbackUrl', () => {
  it('accepts a same-origin absolute path', () => {
    expect(isSafeSameOriginCallbackUrl('/dashboard')).toBe(true);
  });
  it('rejects protocol-relative urls', () => {
    expect(isSafeSameOriginCallbackUrl('//evil.com')).toBe(false);
  });
  it('rejects backslash bypass', () => {
    expect(isSafeSameOriginCallbackUrl('/\\evil.com')).toBe(false);
  });
  it('rejects explicit external schemes', () => {
    expect(isSafeSameOriginCallbackUrl('https://evil.com')).toBe(false);
    expect(isSafeSameOriginCallbackUrl('javascript:alert(1)')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/auth/callbackUrl.test.ts`
Expected: FAIL — cannot find module `./callbackUrl`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/auth/callbackUrl.ts
// Open-redirect defense-in-depth, ported from the starter's SignInForm.
// Accept only same-origin paths; drop anything else.
export function isSafeSameOriginCallbackUrl(value: string): boolean {
  if (value.startsWith('//') || value.startsWith('/\\')) return false;
  if (value.startsWith('/')) return true;
  if (typeof window === 'undefined') return false;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function resolveCallbackUrl(
  callbackParam: string,
  propValue: string | undefined,
): string {
  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get(callbackParam);
    if (fromQuery && isSafeSameOriginCallbackUrl(fromQuery)) return fromQuery;
  }
  return propValue ?? '/';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/auth/callbackUrl.test.ts`
Expected: PASS (4 tests). Note: the `window`-dependent absolute-origin branch is exercised in browser context; node tests cover the path/scheme branches.

- [ ] **Step 5: Commit**

```bash
git add features/auth/callbackUrl.ts features/auth/callbackUrl.test.ts
git commit -m "feat(auth): same-origin callback-url safety helpers"
```

---

### Task 2: Auth copy module (pure, mode-aware, includes spam warning)

**Files:**
- Create: `features/auth/authCopy.ts`
- Test: `features/auth/authCopy.test.ts`

**Interfaces:**
- Consumes: `APP_NAME` from `@/lib/app`.
- Produces:
  - `type AuthMode = 'sign-in' | 'sign-up'`
  - `SPAM_WARNING: string`
  - `getAuthCopy(mode: AuthMode): AuthCopy` where
    ```ts
    interface AuthCopy {
      heading: string;
      subheading: string;
      submitLabel: string;
      showNameField: boolean;
      altPrompt: string;     // e.g. "New here?"
      altLinkLabel: string;  // e.g. "Sign up"
      altHref: string;       // "/sign-up" | "/sign-in"
    }
    ```
  - `sentCopy(email: string): { heading: string; body: string; spam: string; expires: string }`

- [ ] **Step 1: Write the failing test**

```ts
// features/auth/authCopy.test.ts
import { describe, it, expect } from 'vitest';
import { getAuthCopy, sentCopy, SPAM_WARNING } from './authCopy';

describe('getAuthCopy', () => {
  it('returns sign-in copy with a link to sign-up', () => {
    const c = getAuthCopy('sign-in');
    expect(c.heading).toBe('Welcome back');
    expect(c.showNameField).toBe(false);
    expect(c.altHref).toBe('/sign-up');
  });
  it('returns sign-up copy with a name field and a link to sign-in', () => {
    const c = getAuthCopy('sign-up');
    expect(c.showNameField).toBe(true);
    expect(c.altHref).toBe('/sign-in');
  });
});

describe('sentCopy', () => {
  it('embeds the email and the spam warning', () => {
    const c = sentCopy('me@example.com');
    expect(c.body).toContain('me@example.com');
    expect(c.spam).toBe(SPAM_WARNING);
    expect(SPAM_WARNING.toLowerCase()).toContain('spam');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/auth/authCopy.test.ts`
Expected: FAIL — cannot find module `./authCopy`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/auth/authCopy.ts
export type AuthMode = 'sign-in' | 'sign-up';

export interface AuthCopy {
  heading: string;
  subheading: string;
  submitLabel: string;
  showNameField: boolean;
  altPrompt: string;
  altLinkLabel: string;
  altHref: string;
}

export const SPAM_WARNING =
  "Don't see it? Check your spam or junk folder — and add our address to your contacts.";

const COPY: Record<AuthMode, AuthCopy> = {
  'sign-in': {
    heading: 'Welcome back',
    subheading: 'Sign in with a magic link, passkey, or Google.',
    submitLabel: 'Send magic link',
    showNameField: false,
    altPrompt: 'New here?',
    altLinkLabel: 'Sign up',
    altHref: '/sign-up',
  },
  'sign-up': {
    heading: 'Create your account',
    subheading: 'No password needed — we email you a secure sign-in link.',
    submitLabel: 'Create account',
    showNameField: true,
    altPrompt: 'Already have an account?',
    altLinkLabel: 'Sign in',
    altHref: '/sign-in',
  },
};

export function getAuthCopy(mode: AuthMode): AuthCopy {
  return COPY[mode];
}

export function sentCopy(email: string) {
  return {
    heading: 'Check your inbox',
    body: `We sent a sign-in link to ${email}. It expires in 10 minutes.`,
    spam: SPAM_WARNING,
    expires: 'The link expires in 10 minutes.',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/auth/authCopy.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add features/auth/authCopy.ts features/auth/authCopy.test.ts
git commit -m "feat(auth): mode-aware auth copy with spam warning"
```

---

### Task 3: Method-status reducer + resend cooldown (pure)

**Files:**
- Create: `features/auth/authState.ts`
- Test: `features/auth/authState.test.ts`

**Interfaces:**
- Produces:
  - `type Method = 'magicLink' | 'google' | 'passkey'`
  - `type Status = 'idle' | 'sending' | 'sent' | 'error'`
  - `interface AuthState { status: Record<Method, Status>; errors: Record<Method, string>; lastSentAt: number | null }`
  - `const initialAuthState: AuthState`
  - `type AuthAction = { type: 'start'; method: Method } | { type: 'success'; method: Method; at: number } | { type: 'fail'; method: Method; message: string } | { type: 'reset' }`
  - `function authReducer(state: AuthState, action: AuthAction): AuthState`
  - `const RESEND_COOLDOWN_MS = 30_000`
  - `function canResend(lastSentAt: number | null, now: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// features/auth/authState.test.ts
import { describe, it, expect } from 'vitest';
import {
  authReducer,
  initialAuthState,
  canResend,
  RESEND_COOLDOWN_MS,
} from './authState';

describe('authReducer', () => {
  it('marks a method sending on start', () => {
    const s = authReducer(initialAuthState, { type: 'start', method: 'magicLink' });
    expect(s.status.magicLink).toBe('sending');
  });
  it('records success and the send timestamp', () => {
    const s = authReducer(initialAuthState, { type: 'success', method: 'magicLink', at: 1000 });
    expect(s.status.magicLink).toBe('sent');
    expect(s.lastSentAt).toBe(1000);
  });
  it('keeps other methods untouched on failure', () => {
    const started = authReducer(initialAuthState, { type: 'start', method: 'google' });
    const failed = authReducer(started, { type: 'fail', method: 'magicLink', message: 'boom' });
    expect(failed.status.magicLink).toBe('error');
    expect(failed.errors.magicLink).toBe('boom');
    expect(failed.status.google).toBe('sending');
  });
  it('reset returns to initial', () => {
    const s = authReducer(
      { ...initialAuthState, lastSentAt: 5 },
      { type: 'reset' },
    );
    expect(s).toEqual(initialAuthState);
  });
});

describe('canResend', () => {
  it('allows resend when never sent', () => {
    expect(canResend(null, 0)).toBe(true);
  });
  it('blocks within the cooldown window', () => {
    expect(canResend(1000, 1000 + RESEND_COOLDOWN_MS - 1)).toBe(false);
  });
  it('allows after the cooldown window', () => {
    expect(canResend(1000, 1000 + RESEND_COOLDOWN_MS)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/auth/authState.test.ts`
Expected: FAIL — cannot find module `./authState`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/auth/authState.ts
export type Method = 'magicLink' | 'google' | 'passkey';
export type Status = 'idle' | 'sending' | 'sent' | 'error';

export interface AuthState {
  status: Record<Method, Status>;
  errors: Record<Method, string>;
  lastSentAt: number | null;
}

export const initialAuthState: AuthState = {
  status: { magicLink: 'idle', google: 'idle', passkey: 'idle' },
  errors: { magicLink: '', google: '', passkey: '' },
  lastSentAt: null,
};

export type AuthAction =
  | { type: 'start'; method: Method }
  | { type: 'success'; method: Method; at: number }
  | { type: 'fail'; method: Method; message: string }
  | { type: 'reset' };

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'start':
      return {
        ...state,
        status: { ...state.status, [action.method]: 'sending' },
        errors: { ...state.errors, [action.method]: '' },
      };
    case 'success':
      return {
        ...state,
        status: { ...state.status, [action.method]: 'sent' },
        lastSentAt: action.method === 'magicLink' ? action.at : state.lastSentAt,
      };
    case 'fail':
      return {
        ...state,
        status: { ...state.status, [action.method]: 'error' },
        errors: { ...state.errors, [action.method]: action.message },
      };
    case 'reset':
      return initialAuthState;
  }
}

export const RESEND_COOLDOWN_MS = 30_000;

export function canResend(lastSentAt: number | null, now: number): boolean {
  if (lastSentAt === null) return true;
  return now - lastSentAt >= RESEND_COOLDOWN_MS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/auth/authState.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add features/auth/authState.ts features/auth/authState.test.ts
git commit -m "feat(auth): method-status reducer and resend cooldown"
```

---

### Task 4: SentNotice presentational component (renders spam warning)

**Files:**
- Create: `features/auth/SentNotice.tsx`
- Test: `features/auth/SentNotice.test.tsx`

**Interfaces:**
- Consumes: `sentCopy`, `SPAM_WARNING` from `./authCopy`; `Button` from `@/components/ui/button`.
- Produces:
  ```ts
  interface SentNoticeProps {
    email: string;
    canResend: boolean;
    onResend: () => void;
    onUseDifferentEmail: () => void;
  }
  function SentNotice(props: SentNoticeProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// features/auth/SentNotice.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { SentNotice } from './SentNotice';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('SentNotice', () => {
  const base = {
    email: 'me@example.com',
    canResend: true,
    onResend: () => {},
    onUseDifferentEmail: () => {},
  };

  it('shows the destination email', () => {
    expect(html(<SentNotice {...base} />)).toContain('me@example.com');
  });
  it('shows the spam/junk warning', () => {
    expect(html(<SentNotice {...base} />).toLowerCase()).toContain('spam or junk folder');
  });
  it('disables resend when cooldown is active', () => {
    const out = html(<SentNotice {...base} canResend={false} />);
    expect(out).toContain('disabled');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/auth/SentNotice.test.tsx`
Expected: FAIL — cannot find module `./SentNotice`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// features/auth/SentNotice.tsx
'use client';

import { MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sentCopy } from './authCopy';

interface SentNoticeProps {
  email: string;
  canResend: boolean;
  onResend: () => void;
  onUseDifferentEmail: () => void;
}

export function SentNotice({
  email,
  canResend,
  onResend,
  onUseDifferentEmail,
}: SentNoticeProps) {
  const copy = sentCopy(email);
  return (
    <div className="flex flex-col gap-4 text-center" aria-live="polite">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <MailCheck className="size-6 text-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{copy.heading}</h2>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to{' '}
          <span className="font-medium text-foreground">{email}</span>. It
          expires in 10 minutes.
        </p>
      </div>
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        {copy.spam}
      </p>
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onResend}
          disabled={!canResend}
        >
          Resend link
        </Button>
        <Button type="button" variant="ghost" onClick={onUseDifferentEmail}>
          Use a different email
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/auth/SentNotice.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add features/auth/SentNotice.tsx features/auth/SentNotice.test.tsx
git commit -m "feat(auth): SentNotice with check-spam warning and resend"
```

---

### Task 5: BrandPanel presentational component

**Files:**
- Create: `features/auth/BrandPanel.tsx`
- Test: `features/auth/BrandPanel.test.tsx`

**Interfaces:**
- Consumes: `APP_NAME` from `@/lib/app`.
- Produces: `function BrandPanel(): JSX.Element` (no props).

- [ ] **Step 1: Write the failing test**

```tsx
// features/auth/BrandPanel.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { BrandPanel } from './BrandPanel';

describe('BrandPanel', () => {
  it('renders the tagline and all three feature ticks', () => {
    const out = renderToStaticMarkup(<BrandPanel />);
    expect(out).toContain('Track every cent. Plain text. Yours.');
    expect(out).toContain('Double-entry');
    expect(out).toContain('CLI-powered');
    expect(out).toContain('Self-hosted');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/auth/BrandPanel.test.tsx`
Expected: FAIL — cannot find module `./BrandPanel`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// features/auth/BrandPanel.tsx
import { Check } from 'lucide-react';
import { APP_NAME } from '@/lib/app';

const FEATURES = ['Double-entry', 'CLI-powered', 'Self-hosted'] as const;

export function BrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
      {/* decorative gradient wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(120%_80%_at_0%_0%,var(--color-chart-1)/25,transparent),radial-gradient(120%_80%_at_100%_100%,var(--color-chart-2)/25,transparent)]"
      />
      <div className="relative z-10 flex items-center gap-2 text-lg font-semibold tracking-tight">
        <span className="inline-block size-5 rounded-md bg-primary-foreground/90" />
        {APP_NAME}
      </div>

      <div className="relative z-10 space-y-6">
        <p className="max-w-xs text-2xl font-semibold leading-snug">
          Track every cent. Plain text. Yours.
        </p>
        {/* decorative, static sparkline motif — no real data */}
        <div
          aria-hidden
          className="flex h-16 items-end gap-1"
        >
          {[3, 5, 4, 7, 6, 9, 8, 11, 9, 12].map((h, i) => (
            <span
              key={i}
              className="w-2 rounded-sm bg-primary-foreground/30"
              style={{ height: `${h * 6}px` }}
            />
          ))}
        </div>
      </div>

      <ul className="relative z-10 space-y-2 text-sm text-primary-foreground/90">
        {FEATURES.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <Check className="size-4" aria-hidden />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/auth/BrandPanel.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add features/auth/BrandPanel.tsx features/auth/BrandPanel.test.tsx
git commit -m "feat(auth): decorative brand panel for auth screen"
```

---

### Task 6: AuthForm interactive container

**Files:**
- Create: `features/auth/AuthForm.tsx`

**Interfaces:**
- Consumes: `authClient` from `@/lib/auth-client`; `resolveCallbackUrl` from `./callbackUrl`; `getAuthCopy`, type `AuthMode` from `./authCopy`; `authReducer`, `initialAuthState`, `canResend` from `./authState`; `SentNotice` from `./SentNotice`; `Button`, `Input`, `Label`, `Separator` from `@/components/ui/*`.
- Produces:
  ```ts
  interface AuthFormProps { mode: AuthMode }
  function AuthForm(props: AuthFormProps): JSX.Element
  ```

> No unit test for the interactive container — its logic lives in the pure modules from Tasks 1–3 (already tested) and its rendered fragments in Tasks 4–5. Verification is `type-check` + `lint` + the manual run in Task 9. Keep this file thin: wiring only, no business logic.

- [ ] **Step 1: Implement the component**

```tsx
// features/auth/AuthForm.tsx
'use client';

import Link from 'next/link';
import { useReducer, useState, type FormEvent } from 'react';
import { Fingerprint } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { resolveCallbackUrl } from './callbackUrl';
import { getAuthCopy, type AuthMode } from './authCopy';
import { authReducer, initialAuthState, canResend, type Method } from './authState';
import { SentNotice } from './SentNotice';

const CALLBACK_URL = '/dashboard';
const ERROR_CALLBACK_URL = '/sign-in/error';
const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === '1';

interface AuthFormProps {
  mode: AuthMode;
}

export function AuthForm({ mode }: AuthFormProps) {
  const copy = getAuthCopy(mode);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  async function runAttempt(
    method: Method,
    call: () => Promise<{ error: { message?: string | null } | null | undefined }>,
    onSuccess?: () => void,
  ) {
    dispatch({ type: 'start', method });
    try {
      const { error } = await call();
      if (error) {
        dispatch({ type: 'fail', method, message: error.message ?? 'Something went wrong.' });
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
        ...(mode === 'sign-up' && name ? { name } : {}),
      }),
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void sendMagicLink();
  }

  function onGoogle() {
    const social = authClient.signIn.social;
    const callbackURL = resolveCallbackUrl('callbackUrl', CALLBACK_URL);
    return runAttempt('google', () => social({ provider: 'google', callbackURL }));
  }

  function onPasskey() {
    const passkey = authClient.signIn.passkey;
    return runAttempt('passkey', () => passkey(), () => {
      const callbackURL = resolveCallbackUrl('callbackUrl', CALLBACK_URL);
      window.location.assign(callbackURL);
    });
  }

  if (state.status.magicLink === 'sent') {
    return (
      <SentNotice
        email={email}
        canResend={canResend(state.lastSentAt, Date.now())}
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
        <h1 className="text-2xl font-semibold tracking-tight">{copy.heading}</h1>
        <p className="text-sm text-muted-foreground">{copy.subheading}</p>
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={onPasskey} disabled={sending}>
          <Fingerprint className="size-4" aria-hidden />
          Continue with a passkey
        </Button>
        {googleEnabled && (
          <Button type="button" variant="outline" onClick={onGoogle} disabled={sending}>
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
        {copy.showNameField && (
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ada Lovelace"
            />
          </div>
        )}
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
        <Link href={copy.altHref} className="font-medium text-foreground underline-offset-4 hover:underline">
          {copy.altLinkLabel}
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks and lints**

Run: `pnpm type-check && pnpm lint`
Expected: PASS. If `authClient.signIn.magicLink` rejects the `name` field (better-auth version mismatch), drop the `name` spread and the name `<Input>` (degrade to email-only) per the spec's risk note, then re-run.

- [ ] **Step 3: Commit**

```bash
git add features/auth/AuthForm.tsx
git commit -m "feat(auth): interactive AuthForm container"
```

---

### Task 7: AuthScreen split-editorial layout

**Files:**
- Create: `features/auth/AuthScreen.tsx`
- Test: `features/auth/AuthScreen.test.tsx`

**Interfaces:**
- Consumes: `BrandPanel` from `./BrandPanel`; `AuthForm` from `./AuthForm`; type `AuthMode` from `./authCopy`.
- Produces:
  ```ts
  interface AuthScreenProps { mode: AuthMode }
  function AuthScreen(props: AuthScreenProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// features/auth/AuthScreen.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { AuthScreen } from './AuthScreen';

describe('AuthScreen', () => {
  it('renders the brand tagline and a heading for sign-in', () => {
    const out = renderToStaticMarkup(<AuthScreen mode="sign-in" />);
    expect(out).toContain('Track every cent. Plain text. Yours.');
    expect(out).toContain('Welcome back');
  });
  it('renders the create-account heading for sign-up', () => {
    const out = renderToStaticMarkup(<AuthScreen mode="sign-up" />);
    expect(out).toContain('Create your account');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/auth/AuthScreen.test.tsx`
Expected: FAIL — cannot find module `./AuthScreen`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// features/auth/AuthScreen.tsx
import { BrandPanel } from './BrandPanel';
import { AuthForm } from './AuthForm';
import type { AuthMode } from './authCopy';

interface AuthScreenProps {
  mode: AuthMode;
}

export function AuthScreen({ mode }: AuthScreenProps) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <AuthForm mode={mode} />
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/auth/AuthScreen.test.tsx`
Expected: PASS (2 tests). (`BrandPanel` is hidden via `lg:flex` CSS but still in markup, so its text is present.)

- [ ] **Step 5: Commit**

```bash
git add features/auth/AuthScreen.tsx features/auth/AuthScreen.test.tsx
git commit -m "feat(auth): split-editorial AuthScreen layout"
```

---

### Task 8: Route shells for sign-in and sign-up

**Files:**
- Modify: `app/sign-in/page.tsx`
- Create: `app/sign-up/page.tsx`

**Interfaces:**
- Consumes: `AuthScreen` from `@/features/auth/AuthScreen`.

- [ ] **Step 1: Replace the sign-in page**

```tsx
// app/sign-in/page.tsx
import { AuthScreen } from '@/features/auth/AuthScreen';

export default function Page() {
  return <AuthScreen mode="sign-in" />;
}
```

- [ ] **Step 2: Create the sign-up page**

```tsx
// app/sign-up/page.tsx
import { AuthScreen } from '@/features/auth/AuthScreen';

export default function Page() {
  return <AuthScreen mode="sign-up" />;
}
```

- [ ] **Step 3: Verify type-check, lint, and full test suite**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS. No remaining import of `SignInPage` from the starter in `app/sign-in/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/sign-in/page.tsx app/sign-up/page.tsx
git commit -m "feat(auth): wire custom auth screens into sign-in and sign-up routes"
```

---

### Task 9: Open registration (remove single-admin) + manual verification

**Files:**
- Modify: `lib/auth.ts`

**Interfaces:**
- None exported; this changes auth runtime config.

- [ ] **Step 1: Remove the single-admin allowlist**

In `lib/auth.ts`, delete the `singleAdmin: 'sharp.fk@gmail.com',` line from the `createAuth({ ... })` call so magic-link (and Google, if enabled) accept any email. Resulting call:

```ts
export const auth = await createAuth({
  passkey: { rpName: APP_NAME },
  transport: postalTransport,
  ...(googleConfigured && { google: {} }),
});
```

- [ ] **Step 2: Verify type-check, lint, and full test suite**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS. Confirm no other references to `singleAdmin` remain: `grep -rn singleAdmin lib app features` returns nothing.

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev`, then:
- Visit `http://localhost:3000/sign-in` — split layout renders; brand panel left, form right; passkey button present; Google only if `NEXT_PUBLIC_ENABLE_GOOGLE=1`.
- Submit an email — UI swaps to the "Check your inbox" state showing the email and the **spam/junk warning**; "Resend link" is disabled for ~30s; "Use a different email" returns to the form.
- Visit `http://localhost:3000/sign-up` — heading "Create your account", Name field present, link back to sign-in works.
- Toggle the OS/browser to dark mode — colors adapt via tokens (no hardcoded colors).
- Narrow the viewport — brand panel hides, card centers.

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(auth): open registration to multi-user (remove single-admin gate)"
```

---

## Self-Review

**Spec coverage:**
- Split-editorial layout → Tasks 5, 7. Auth card/form → Task 6. Spam warning in sent state → Tasks 2, 4. Resend with cooldown + "use different email" → Tasks 3, 4, 6. Sign-up name field + cross-links → Tasks 2, 6, 8. Per-method independent status → Task 3. Open-redirect safety → Task 1. Multi-user open registration → Task 9. Dark-mode/a11y/responsive → Tasks 4–7 (tokens, `aria-live`, `lg:` breakpoints) + Task 9 manual check. Testing via pure units + static markup (no new deps) → Tasks 1–5, 7. Out-of-scope items (billing, roles, email template, starter package) → untouched.
- Brand copy verbatim (`Track every cent. Plain text. Yours.`, three ticks) → Task 5. `APP_NAME` not hardcoded → Tasks 5, 6 use `@/lib/app`.

**Placeholder scan:** No TBD/TODO; every code step shows full code; risk fallback (drop `name`) is concrete.

**Type consistency:** `AuthMode` ('sign-in'|'sign-up') consistent across copy/form/screen/pages. `Method`/`Status`/`AuthState`/`AuthAction` consistent between Task 3 and Task 6. `sentCopy`/`SPAM_WARNING` consistent between Tasks 2 and 4. `resolveCallbackUrl(callbackParam, propValue)` signature consistent between Tasks 1 and 6. `canResend(lastSentAt, now)` consistent between Tasks 3, 4 (via prop), and 6.

**Note on the `name` field:** Task 6 Step 2 includes the verified fallback if the installed better-auth magic-link signature rejects `name`.
