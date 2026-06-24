export type AuthMode = 'sign-in' | 'sign-up';

export interface AuthCopy {
  heading: string;
  subheading: string;
  submitLabel: string;
  showNameField: boolean;
  altPrompt: string;
  altLinkLabel: string;
  altHref: string;
}

export const SPAM_WARNING =
  "Don't see it? Check your spam or junk folder — and add our address to your contacts.";

const COPY: Record<AuthMode, AuthCopy> = {
  'sign-in': {
    heading: 'Welcome back',
    subheading: 'Sign in with a magic link, passkey, or Google.',
    submitLabel: 'Send magic link',
    showNameField: false,
    altPrompt: 'New here?',
    altLinkLabel: 'Sign up',
    altHref: '/sign-up',
  },
  'sign-up': {
    heading: 'Create your account',
    subheading: 'No password needed — we email you a secure sign-in link.',
    submitLabel: 'Create account',
    showNameField: true,
    altPrompt: 'Already have an account?',
    altLinkLabel: 'Sign in',
    altHref: '/sign-in',
  },
};

export function getAuthCopy(mode: AuthMode): AuthCopy {
  return COPY[mode];
}

export function sentCopy(email: string) {
  return {
    heading: 'Check your inbox',
    body: `We sent a sign-in link to ${email}. It expires in 10 minutes.`,
    spam: SPAM_WARNING,
    expires: 'The link expires in 10 minutes.',
  };
}
