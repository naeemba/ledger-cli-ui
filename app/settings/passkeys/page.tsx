'use client';

import { authClient } from '@/lib/auth-client';
import { PasskeyManagerPage } from '@naeemba/next-starter/pages/passkey-manager';

export default function Page() {
  return <PasskeyManagerPage authClient={authClient} />;
}
