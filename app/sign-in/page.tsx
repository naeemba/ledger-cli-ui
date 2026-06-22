'use client';

import { authClient } from '@/lib/auth-client';
import { SignInPage } from '@naeemba/next-starter/pages/sign-in';

const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === '1';

export default function Page() {
  return (
    <SignInPage
      authClient={authClient}
      callbackUrl="/dashboard"
      errorCallbackUrl="/sign-in/error"
      passkey
      {...(googleEnabled && { google: true })}
      classNames={{
        main: 'min-h-screen flex items-center justify-center bg-background',
        heading: 'text-2xl font-semibold tracking-tight',
        emailInput: 'w-full rounded-md border bg-background px-3 py-2 text-sm',
        submitButton:
          'w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground',
        googleButton: 'w-full rounded-md border px-3 py-2 text-sm',
        error: 'text-sm text-destructive mt-1',
      }}
    />
  );
}
