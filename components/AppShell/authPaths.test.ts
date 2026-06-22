import { describe, expect, it } from 'vitest';
import { isAuthPath } from './authPaths';

describe('isAuthPath', () => {
  it('treats the starter sign-in routes as auth pages', () => {
    expect(isAuthPath('/sign-in')).toBe(true);
    expect(isAuthPath('/sign-in/error')).toBe(true);
  });

  it('treats app routes as non-auth pages', () => {
    expect(isAuthPath('/')).toBe(false);
    expect(isAuthPath('/balance')).toBe(false);
    // Guards against the old, now-deleted route names regressing back in.
    expect(isAuthPath('/login')).toBe(false);
    expect(isAuthPath('/signup')).toBe(false);
  });
});
