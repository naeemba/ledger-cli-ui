import 'server-only';

/** True iff an error-tracking DSN is configured. Gates all Sentry init. */
export const isSentryEnabled = (): boolean => Boolean(process.env.SENTRY_DSN);
