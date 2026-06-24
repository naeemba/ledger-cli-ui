import { describe, it, expect } from 'vitest';
import {
  authReducer,
  initialAuthState,
  canResend,
  RESEND_COOLDOWN_MS,
} from './authState';

describe('authReducer', () => {
  it('marks a method sending on start', () => {
    const s = authReducer(initialAuthState, {
      type: 'start',
      method: 'magicLink',
    });
    expect(s.status.magicLink).toBe('sending');
  });
  it('records success and the send timestamp', () => {
    const s = authReducer(initialAuthState, {
      type: 'success',
      method: 'magicLink',
      at: 1000,
    });
    expect(s.status.magicLink).toBe('sent');
    expect(s.lastSentAt).toBe(1000);
  });
  it('keeps other methods untouched on failure', () => {
    const started = authReducer(initialAuthState, {
      type: 'start',
      method: 'google',
    });
    const failed = authReducer(started, {
      type: 'fail',
      method: 'magicLink',
      message: 'boom',
    });
    expect(failed.status.magicLink).toBe('error');
    expect(failed.errors.magicLink).toBe('boom');
    expect(failed.status.google).toBe('sending');
  });
  it('reset returns to initial', () => {
    const s = authReducer(
      { ...initialAuthState, lastSentAt: 5 },
      { type: 'reset' }
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
