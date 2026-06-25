import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
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
  // All four are opaque without the user's secret.
  return NextResponse.json({
    passSalt: row.passSalt,
    argonParams: row.argonParams,
    wrapPassphrase: row.wrapPassphrase,
    wrapRecovery: row.wrapRecovery,
  });
}
