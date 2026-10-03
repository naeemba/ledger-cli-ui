import { isSharedPagePath } from '@/components/AppShell/publicPaths';
import * as Sentry from '@sentry/nextjs';

// Never start Sentry on a shared debt page: the SDK records the full page URL
// on events and breadcrumbs, and that URL's fragment is the page's decryption key.
if (
  process.env.NEXT_PUBLIC_SENTRY_DSN &&
  !isSharedPagePath(window.location.pathname)
) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_APP_ENV,
    tracesSampleRate: 0,
  });
}
