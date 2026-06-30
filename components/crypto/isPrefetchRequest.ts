/**
 * True when the incoming request is a Next.js App Router *prefetch* RSC request
 * rather than a real navigation or a full document load.
 *
 * The server gate must never `redirect()` on a prefetch: the App Router retries
 * a prefetch that receives a redirect in a tight loop (vercel/next.js#48438),
 * which — once the in-RAM DEK is dropped on deploy and every route bounces to
 * `/crypto/unlock` — turns into a storm of `/crypto/unlock?_rsc=` requests and a
 * blank screen. Real navigations and full reloads carry neither header, so they
 * still redirect normally.
 *
 * Two signals are checked because `next-router-prefetch` is not reliably present
 * on every prefetch (vercel/next.js#85836); `purpose: prefetch` covers the rest.
 * Header lookups are case-insensitive via the Headers API.
 */
export const isPrefetchRequest = (headers: Headers): boolean =>
  headers.get('next-router-prefetch') === '1' ||
  headers.get('purpose')?.toLowerCase() === 'prefetch';
