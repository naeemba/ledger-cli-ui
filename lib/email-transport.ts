import 'server-only';
import { env } from '@/lib/env';
import type { EmailTransport } from '@naeemba/next-starter/email';

/**
 * Magic-link delivery via the self-hosted Postal server (postal.raxel.studio)
 * over its HTTPS API. When passed to `createAuth({ transport })`, the starter
 * skips its built-in Resend dispatch entirely (no RESEND_API_KEY needed).
 *
 * Env:
 *   POSTAL_API_URL  e.g. https://postal.raxel.studio
 *   POSTAL_API_KEY  a Postal "API" credential key for the mail server
 */
export const postalTransport: EmailTransport = async ({
  to,
  from,
  subject,
  html,
  text,
}) => {
  const res = await fetch(`${env.POSTAL_API_URL!}/api/v1/send/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Server-API-Key': env.POSTAL_API_KEY!,
    },
    body: JSON.stringify({
      to: [to],
      from,
      subject,
      html_body: html,
      plain_body: text,
    }),
  });

  // Postal returns 200 with { status: 'success' | 'error' | 'parameter-error' }
  const body = (await res.json().catch(() => null)) as {
    status?: string;
  } | null;

  if (!res.ok || body?.status !== 'success') {
    throw new Error(
      `[email] Postal send failed (HTTP ${res.status}): ${JSON.stringify(body)}`
    );
  }
};

const firstUrl = (s?: string): string | undefined =>
  s?.match(/https?:\/\/[^\s"'<>]+/)?.[0];

/**
 * Dev transport: instead of sending mail, print the message — and the magic
 * link / verification code it carries — to the server console. Selected when
 * EMAIL_TRANSPORT=console (see lib/env). Never use in production.
 */
export const consoleTransport: EmailTransport = async ({
  to,
  subject,
  text,
  html,
}) => {
  const link = firstUrl(text) ?? firstUrl(html);
  const lines = [
    '',
    '┌─ ✉  DEV EMAIL (not sent) ───────────────────────────────',
    `│ To:      ${to}`,
    `│ Subject: ${subject}`,
    ...(link ? [`│ Link:    ${link}`] : []),
    '│ ── body ──',
    ...(text ?? '').split('\n').map((l) => `│ ${l}`),
    '└─────────────────────────────────────────────────────────',
    '',
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
};

/**
 * The transport the app actually uses, chosen by EMAIL_TRANSPORT. Prefer this
 * over the named transports above so dev (console) and prod (Postal) stay in
 * lockstep across every caller.
 */
export const emailTransport: EmailTransport =
  env.EMAIL_TRANSPORT === 'console' ? consoleTransport : postalTransport;
