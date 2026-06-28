import { requireUser } from '@/lib/auth/require-user';
import {
  getPasskeyWrapRepository,
  getUserCryptoRepository,
} from '@/lib/crypto';
import type { CryptoMaterial } from '@/lib/crypto/setupSchema';
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  const user = await requireUser();
  const row = await getUserCryptoRepository().get(user.id);
  if (!row) {
    return NextResponse.json(
      { error: 'Encryption is not set up.' },
      { status: 404 }
    );
  }
  const wraps = await getPasskeyWrapRepository().listByUser(user.id);
  // All blobs are opaque without the user's secret.
  const material: CryptoMaterial = {
    passSalt: row.passSalt,
    argonParams: row.argonParams,
    wrapPassphrase: row.wrapPassphrase,
    wrapRecovery: row.wrapRecovery,
    passkeys: wraps.map((w) => ({
      credentialId: w.credentialId,
      wrap: w.wrap,
    })),
  };
  return NextResponse.json(material);
}
