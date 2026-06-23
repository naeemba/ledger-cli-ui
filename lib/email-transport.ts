import 'server-only';
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
  const baseUrl = process.env.POSTAL_API_URL;
  const apiKey = process.env.POSTAL_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      '[email] POSTAL_API_URL and POSTAL_API_KEY must be set to send mail.'
    );
  }

  const res = await fetch(`${baseUrl}/api/v1/send/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Server-API-Key': apiKey,
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
    data?: unknown;
  } | null;

  if (!res.ok || body?.status !== 'success') {
    throw new Error(
      `[email] Postal send failed (HTTP ${res.status}): ${JSON.stringify(body)}`
    );
  }
};
