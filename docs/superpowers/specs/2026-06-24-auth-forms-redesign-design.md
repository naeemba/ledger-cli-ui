# Auth Forms Redesign — Studio-grade Passwordless Multi-user

**Date:** 2026-06-24
**Status:** Approved design, pending implementation plan
**Branch:** `feat/auth-redesign`

## Goal

Replace the minimal starter sign-in screen with a bespoke, studio-grade
passwordless auth experience, add a matching sign-up screen, and open the app
to real multi-user self-registration. Forms must be beautiful, easy to fill,
and require no unnecessary data (email-only, passwordless).

## Context (as-found)

- **Auth is fully passwordless**: better-auth magic-link (email) + passkey +
  optional Google, provided by `@naeemba/next-starter`. No passwords anywhere.
- **Single-admin today**: `lib/auth.ts` sets `singleAdmin: 'sharp.fk@gmail.com'`,
  which the starter turns into an allowlist gating both magic-link and Google.
  This is the *only* single-user gate in the codebase.
- **Data layer is already multi-tenant**: everything is keyed by `userId`
  (`getJournalDir(userId)`, `ensureLayout(userId)`, per-user storage pulls and
  locks). A new user's journal auto-provisions on first access. No data-isolation
  work is required to support multiple users.
- **Current UI**: `app/sign-in/page.tsx` renders the starter's intentionally
  minimal `SignInPage`, dressed with a few Tailwind classes. The starter
  documents a "blank canvas" escape hatch: call
  `authClient.signIn.magicLink / social / passkey` directly.
- **Design system**: shadcn UI kit in `components/ui`, Tailwind v4 with oklch
  tokens (neutral primary, teal/blue accents), Geist font, `next-themes` dark
  mode, `--radius` 0.625rem, lucide icons.

## Decisions

| Decision | Choice |
| --- | --- |
| Signup meaning | Open to **real multi-user** self-registration |
| Build approach | **Custom from scratch** in-repo; starter package untouched |
| Visual direction | **Split editorial** (brand panel + auth card) |
| Registration posture | **Fully open** — remove the `singleAdmin` gate entirely |
| Brand copy | Use drafted tagline + feature ticks |
| Magic-link sent state | Must include an explicit **check-spam** warning |

## Architecture

Follows the project's feature-over-app-dir + thin-route-shell conventions.

```
app/sign-in/page.tsx        # thin shell -> <AuthScreen mode="sign-in" />
app/sign-up/page.tsx        # NEW thin shell -> <AuthScreen mode="sign-up" />
features/auth/
  AuthScreen.tsx            # split-editorial layout; brand panel + card slot
  AuthForm.tsx              # passkey/Google/email form + all states
  BrandPanel.tsx            # wordmark, tagline, CSS-only motif, feature ticks
  authCopy.ts               # all copy in one place, keyed by mode
  AuthForm.test.tsx         # unit tests
```

- `AuthScreen` owns layout and renders `BrandPanel` + `AuthForm`, passing `mode`.
- `AuthForm` calls `authClient` (`@/lib/auth-client`) directly. It does **not**
  use the starter's `SignInPage`/`SignInForm`.
- Reuses `components/ui` primitives (`button`, `input`, `label`, `card`,
  `separator`) and existing theme tokens. No new color system.

## Component behavior

### AuthForm

- Methods rendered: passkey button (hidden when WebAuthn unsupported), Google
  button (only when `NEXT_PUBLIC_ENABLE_GOOGLE === '1'`), divider, email field.
  Sign-up mode additionally shows an optional **name** field.
- **Per-method independent status** (`idle | sending | sent | error`) so a Google
  error never clobbers the email form, mirroring the starter's `MethodStatus`.
- Magic-link submit calls
  `authClient.signIn.magicLink({ email, name?, callbackURL, errorCallbackURL })`
  with `callbackURL = '/dashboard'`, `errorCallbackURL = '/sign-in/error'`.
- Open-redirect safety: reuse same-origin callback validation (only accept
  same-origin path callbacks from `?callbackUrl=`), matching the starter's
  defense-in-depth.

### Magic-link "sent" state (includes spam warning)

On successful send, swap the email field for a confirmation panel:

- Heading: "Check your inbox"
- Body: "We sent a sign-in link to **{email}**. It expires in 10 minutes."
- **Spam warning (required): "Don't see it? Check your spam or junk folder — and
  add our address to your contacts."**
- Actions: **Resend link** (with a short cooldown, e.g. 30s, to prevent abuse)
  and **Use a different email** (returns to the form).
- Same treatment in both modes.

### BrandPanel

- Wordmark ("Ledger"), tagline **"Track every cent. Plain text. Yours."**
- Feature ticks: **Double-entry · CLI-powered · Self-hosted**.
- CSS-only decorative motif (e.g. a static/subtle sparkline + a sample balance
  figure). Purely decorative — no real data, no network.

### Modes & cross-links

- Sign-in card heading "Welcome back" with a "New here? Sign up" link to
  `/sign-up`. Sign-up card heading "Create your account" with a "Have an account?
  Sign in" link to `/sign-in`. Copy lives in `authCopy.ts`.

## Auth config change (multi-user)

- In `lib/auth.ts`, **remove** `singleAdmin: 'sharp.fk@gmail.com'`. With no
  allowlist, magic-link self-registers any email; `ensureLayout` provisions the
  per-user journal on first access. Registration is fully open.
- Google gating, if enabled, likewise becomes open (no allowlist) — consistent
  with the magic-link posture.

## Accessibility & responsive

- Labels tied to inputs; `aria-live="polite"` on sent/error messages; visible
  focus rings via `--ring`; full keyboard navigation.
- Mobile: brand panel collapses (or moves to a compact header); card centers.
- Dark-mode aware through existing tokens (no hardcoded colors).

## Testing

Vitest + Testing Library, mocking `@/lib/auth-client`:

- Email submit calls `signIn.magicLink` with the entered email (and name in
  sign-up mode).
- Sent state renders the **check-spam** warning and the masked email.
- Resend respects the cooldown; "Use a different email" returns to the form.
- Error state renders per-method without clobbering other methods.
- Passkey button hidden when WebAuthn is unsupported.
- Google button hidden unless `NEXT_PUBLIC_ENABLE_GOOGLE === '1'`.

## Out of scope

- Billing, roles/permissions, team/multi-tenant org features.
- Email template redesign (uses the existing postal transport template).
- Changes to the `@naeemba/next-starter` package itself.

## Risks / notes

- **Fully open registration** means a deployed instance accepts any sign-up the
  moment this merges. Acceptable per decision; revisit if abuse appears.
- Magic-link `name` passthrough for new-user creation must be verified against
  the installed better-auth version during implementation; if unsupported, the
  name field is dropped (email-only) rather than blocking the flow.
