// Open-redirect defense: a callback is followed only when the browser would
// resolve it to this origin. Prefix checks on the raw string are not enough:
// the URL parser strips tabs and newlines and reads `\` as `/`, so a value such
// as `/<tab>/evil.com` passes a "starts with one slash" test and still lands on
// evil.com. Parsing the value the way the browser will, and handing back only
// the parsed path, leaves nothing for the browser to reinterpret.
export function toSameOriginPath(value: string, origin: string): string | null {
  try {
    const parsed = new URL(value, origin);
    if (parsed.origin !== origin) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function resolveCallbackUrl(
  callbackParam: string,
  fallback: string
): string {
  if (typeof window === 'undefined') return fallback;
  const fromQuery = new URLSearchParams(window.location.search).get(
    callbackParam
  );
  if (!fromQuery) return fallback;
  return toSameOriginPath(fromQuery, window.location.origin) ?? fallback;
}
