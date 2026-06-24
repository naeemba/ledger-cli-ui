export type Method = 'magicLink' | 'google' | 'passkey';
export type Status = 'idle' | 'sending' | 'sent' | 'error';

export interface AuthState {
  status: Record<Method, Status>;
  errors: Record<Method, string>;
  lastSentAt: number | null;
}

export const initialAuthState: AuthState = {
  status: { magicLink: 'idle', google: 'idle', passkey: 'idle' },
  errors: { magicLink: '', google: '', passkey: '' },
  lastSentAt: null,
};

export type AuthAction =
  | { type: 'start'; method: Method }
  | { type: 'success'; method: Method; at: number }
  | { type: 'fail'; method: Method; message: string }
  | { type: 'reset' };

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'start':
      return {
        ...state,
        status: { ...state.status, [action.method]: 'sending' },
        errors: { ...state.errors, [action.method]: '' },
      };
    case 'success':
      return {
        ...state,
        status: { ...state.status, [action.method]: 'sent' },
        lastSentAt:
          action.method === 'magicLink' ? action.at : state.lastSentAt,
      };
    case 'fail':
      return {
        ...state,
        status: { ...state.status, [action.method]: 'error' },
        errors: { ...state.errors, [action.method]: action.message },
      };
    case 'reset':
      return initialAuthState;
  }
}

export const RESEND_COOLDOWN_MS = 30_000;

export function canResend(lastSentAt: number | null, now: number): boolean {
  if (lastSentAt === null) return true;
  return now - lastSentAt >= RESEND_COOLDOWN_MS;
}
