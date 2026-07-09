'use client';

import PageContainer from '@/components/PageContainer';
import { authClient } from '@/lib/auth-client';
import { PasskeyManagerPage } from '@naeemba/next-starter/pages/passkey-manager';

export default function Page() {
  return (
    <PageContainer>
      <PasskeyManagerPage authClient={authClient} />
    </PageContainer>
  );
}
