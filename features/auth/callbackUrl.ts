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
  propValue: string | undefined
): string {
  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get(
      callbackParam
    );
    if (fromQuery && isSafeSameOriginCallbackUrl(fromQuery)) return fromQuery;
  }
  return propValue ?? '/';
}
